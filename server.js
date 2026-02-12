require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
      cors: { origin: '*', credentials: true }
});

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));

// Create default General server if not exists
function ensureDefaults() {
      const systemUser = db.prepare('SELECT id FROM users WHERE id = ?').get('system');
      if (!systemUser) {
            db.prepare('INSERT INTO users (id, username, email, password, status) VALUES (?, ?, ?, ?, ?)').run('system', 'System', 'system@slayzcord.local', 'system', 'offline');
            console.log('System user created');
      }

      const general = db.prepare('SELECT id FROM servers WHERE name = ?').get('General');
      if (!general) {
            const serverId = uuidv4();
            const inviteCode = 'general';
            db.prepare('INSERT INTO servers (id, name, owner_id, invite_code) VALUES (?, ?, ?, ?)').run(serverId, 'General', 'system', inviteCode);
            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), serverId, 'welcome', 'text', 0);
            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), serverId, 'general', 'text', 1);
            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), serverId, 'Voice Chat', 'voice', 2);
            console.log('Default General server created');
      }
}
ensureDefaults();

// Socket.io authentication
io.use((socket, next) => {
      const cookies = socket.handshake.headers.cookie;
      if (!cookies) return next(new Error('Authentication required'));

      const tokenCookie = cookies.split(';').find(c => c.trim().startsWith('token='));
      if (!tokenCookie) return next(new Error('No token'));

      const token = tokenCookie.split('=')[1];
      try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
      } catch (err) {
            next(new Error('Invalid token'));
      }
});

// Track online users and voice channels
const onlineUsers = new Map();
const voiceChannels = new Map(); // channelId -> Set of { socketId, userId, username, muted, deafened }

io.on('connection', (socket) => {
      console.log(`User connected: ${socket.user.username}`);

      // Set user online
      onlineUsers.set(socket.user.id, { socketId: socket.id, username: socket.user.username });
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', socket.user.id);
      io.emit('user:status', { userId: socket.user.id, status: 'online' });

      // Join server rooms
      const userServers = db.prepare('SELECT server_id FROM members WHERE user_id = ?').all(socket.user.id);
      userServers.forEach(s => socket.join(`server:${s.server_id}`));

      // Channel join
      socket.on('channel:join', (channelId) => {
            socket.join(`channel:${channelId}`);
      });

      socket.on('channel:leave', (channelId) => {
            socket.leave(`channel:${channelId}`);
      });

      // Messaging
      socket.on('message:send', (data) => {
            const { channelId, content } = data;
            if (!content || !content.trim()) return;

            const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
            if (!channel) return;

            const member = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(channel.server_id, socket.user.id);
            if (!member) return;

            const msgId = uuidv4();
            const now = new Date().toISOString();
            db.prepare('INSERT INTO messages (id, channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)').run(msgId, channelId, socket.user.id, content.trim(), now);

            const user = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(socket.user.id);

            const message = {
                  id: msgId,
                  channel_id: channelId,
                  user_id: socket.user.id,
                  content: content.trim(),
                  username: user.username,
                  avatar: user.avatar,
                  created_at: now
            };

            io.to(`channel:${channelId}`).emit('message:new', message);
      });

      // Typing indicator
      socket.on('typing:start', (channelId) => {
            socket.to(`channel:${channelId}`).emit('typing:start', {
                  userId: socket.user.id,
                  username: socket.user.username,
                  channelId
            });
      });

      socket.on('typing:stop', (channelId) => {
            socket.to(`channel:${channelId}`).emit('typing:stop', {
                  userId: socket.user.id,
                  channelId
            });
      });

      // Voice channel system
      socket.on('voice:join', (channelId) => {
            if (!voiceChannels.has(channelId)) {
                  voiceChannels.set(channelId, new Map());
            }

            // Leave any existing voice channel
            voiceChannels.forEach((users, chId) => {
                  if (users.has(socket.id)) {
                        users.delete(socket.id);
                        io.emit('voice:user-left', { channelId: chId, userId: socket.user.id });
                        if (users.size === 0) voiceChannels.delete(chId);
                  }
            });

            const vcUsers = voiceChannels.get(channelId);
            vcUsers.set(socket.id, {
                  userId: socket.user.id,
                  username: socket.user.username,
                  muted: false,
                  deafened: false,
                  streaming: false
            });

            socket.join(`voice:${channelId}`);

            // Send current voice users to the joiner
            const usersInChannel = Array.from(vcUsers.values());
            socket.emit('voice:users', { channelId, users: usersInChannel });

            // Notify others
            socket.to(`voice:${channelId}`).emit('voice:user-joined', {
                  channelId,
                  userId: socket.user.id,
                  username: socket.user.username
            });

            io.emit('voice:channel-update', {
                  channelId,
                  users: usersInChannel
            });
      });

      socket.on('voice:leave', () => {
            voiceChannels.forEach((users, channelId) => {
                  if (users.has(socket.id)) {
                        users.delete(socket.id);
                        socket.leave(`voice:${channelId}`);
                        io.emit('voice:user-left', { channelId, userId: socket.user.id });
                        io.emit('voice:channel-update', {
                              channelId,
                              users: Array.from(users.values())
                        });
                        if (users.size === 0) voiceChannels.delete(channelId);
                  }
            });
      });

      socket.on('voice:mute', (muted) => {
            voiceChannels.forEach((users, channelId) => {
                  const user = users.get(socket.id);
                  if (user) {
                        user.muted = muted;
                        io.to(`voice:${channelId}`).emit('voice:user-mute', {
                              userId: socket.user.id,
                              muted
                        });
                  }
            });
      });

      socket.on('voice:deafen', (deafened) => {
            voiceChannels.forEach((users, channelId) => {
                  const user = users.get(socket.id);
                  if (user) {
                        user.deafened = deafened;
                        user.muted = deafened ? true : user.muted;
                        io.to(`voice:${channelId}`).emit('voice:user-deafen', {
                              userId: socket.user.id,
                              deafened,
                              muted: user.muted
                        });
                  }
            });
      });

      // WebRTC signaling
      socket.on('webrtc:offer', (data) => {
            const target = onlineUsers.get(data.targetUserId);
            if (target) {
                  io.to(target.socketId).emit('webrtc:offer', {
                        offer: data.offer,
                        fromUserId: socket.user.id,
                        fromUsername: socket.user.username
                  });
            }
      });

      socket.on('webrtc:answer', (data) => {
            const target = onlineUsers.get(data.targetUserId);
            if (target) {
                  io.to(target.socketId).emit('webrtc:answer', {
                        answer: data.answer,
                        fromUserId: socket.user.id
                  });
            }
      });

      socket.on('webrtc:ice-candidate', (data) => {
            const target = onlineUsers.get(data.targetUserId);
            if (target) {
                  io.to(target.socketId).emit('webrtc:ice-candidate', {
                        candidate: data.candidate,
                        fromUserId: socket.user.id
                  });
            }
      });

      // Screen share signaling
      socket.on('screen:start', (channelId) => {
            voiceChannels.forEach((users) => {
                  const user = users.get(socket.id);
                  if (user) user.streaming = true;
            });
            socket.to(`voice:${channelId}`).emit('screen:started', {
                  userId: socket.user.id,
                  username: socket.user.username
            });
      });

      socket.on('screen:stop', (channelId) => {
            voiceChannels.forEach((users) => {
                  const user = users.get(socket.id);
                  if (user) user.streaming = false;
            });
            socket.to(`voice:${channelId}`).emit('screen:stopped', {
                  userId: socket.user.id
            });
      });

      // Disconnect
      socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.username}`);
            onlineUsers.delete(socket.user.id);
            db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', socket.user.id);
            io.emit('user:status', { userId: socket.user.id, status: 'offline' });

            // Remove from voice channels
            voiceChannels.forEach((users, channelId) => {
                  if (users.has(socket.id)) {
                        users.delete(socket.id);
                        io.emit('voice:user-left', { channelId, userId: socket.user.id });
                        io.emit('voice:channel-update', {
                              channelId,
                              users: Array.from(users.values())
                        });
                        if (users.size === 0) voiceChannels.delete(channelId);
                  }
            });
      });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
      console.log(`SlayzCord running on port ${PORT}`);
});
