// Global State
let socket;
let currentServerId = null;
let currentChannelId = null;
let currentUser = null;
let usersCache = new Map(); // userId -> user object

// DOM Elements
const serverList = document.getElementById('server-list');
const channelList = document.getElementById('channel-list');
const messagesList = document.getElementById('messages-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const serverNameEl = document.getElementById('server-name');
const chatChannelName = document.getElementById('chat-channel-name');
const welcomeChannelName = document.getElementById('welcome-channel-name');
const welcomeChannelName2 = document.getElementById('welcome-channel-name2');
const serverIcons = document.getElementById('server-icons');
const onlineMembers = document.getElementById('online-members');
const offlineMembers = document.getElementById('offline-members');
const onlineCount = document.getElementById('online-count');
const offlineCount = document.getElementById('offline-count');
const userAvatarEl = document.getElementById('user-avatar');
const userAvatarLetter = document.getElementById('user-avatar-letter');
const userNameEl = document.getElementById('user-name');
const userTagEl = document.getElementById('user-tag');

// Modals
const createServerModal = document.getElementById('create-server-modal');
const addServerBtn = document.getElementById('add-server-btn');
const cancelCreateServerBtn = document.getElementById('cancel-create-server');
const confirmCreateServerBtn = document.getElementById('confirm-create-server');
const confirmJoinServerBtn = document.getElementById('confirm-join-server');
const newServerNameInput = document.getElementById('new-server-name');
const joinInviteCodeInput = document.getElementById('join-invite-code');

// Initialize App (Called by auth.js or checkAuth)
window.initializeApp = function (user) {
      currentUser = user;

      // Show App
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');

      // Update User Panel
      userNameEl.textContent = user.username;
      userTagEl.textContent = user.custom_status || 'Online';
      if (user.avatar) {
            userAvatarLetter.style.backgroundImage = `url(${user.avatar})`;
            userAvatarLetter.textContent = '';
      } else {
            userAvatarLetter.style.backgroundImage = 'none';
            userAvatarLetter.textContent = user.username.charAt(0).toUpperCase();
      }

      connectSocket();
      loadServers(); // Load server list
};

// Connect Socket.io
function connectSocket() {
      socket = io();

      socket.on('connect', () => {
            console.log('Connected to socket server');
      });

      socket.on('message:new', (message) => {
            if (message.channel_id === currentChannelId) {
                  appendMessage(message);
                  scrollToBottom();
            }
      });

      socket.on('user:status', (data) => {
            // Update member list status if user is in current view
            if (currentServerId) loadMembers(currentServerId);
      });

      // Forward voice events to voice.js if it exists
      if (window.handleVoiceEvent) {
            socket.onAny((event, ...args) => {
                  if (event.startsWith('voice:') || event.startsWith('webrtc:') || event.startsWith('screen:')) {
                        window.handleVoiceEvent(event, ...args);
                  }
            });
      }
}

// Load Servers
async function loadServers() {
      try {
            const res = await fetch('/api/servers');
            const data = await res.json();
            serverIcons.innerHTML = '';

            data.servers.forEach(server => {
                  const icon = document.createElement('div');
                  icon.className = 'server-icon';
                  icon.dataset.id = server.id;
                  icon.title = server.name;

                  if (server.icon) {
                        icon.style.backgroundImage = `url(${server.icon})`;
                        icon.style.backgroundSize = 'cover';
                  } else {
                        icon.textContent = server.name.substring(0, 2).toUpperCase();
                  }

                  icon.addEventListener('click', () => switchServer(server.id));
                  serverIcons.appendChild(icon);
            });

            // Auto-select first server if exists
            if (data.servers.length > 0) {
                  switchServer(data.servers[0].id);
            }
      } catch (err) {
            console.error('Load servers error:', err);
      }
}

// Switch Server
async function switchServer(serverId) {
      if (currentServerId === serverId) return;
      currentServerId = serverId;

      // Update Active Icon
      document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
      const activeIcon = document.querySelector(`.server-icon[data-id="${serverId}"]`);
      if (activeIcon) activeIcon.classList.add('active');

      // Load Server Details
      try {
            const res = await fetch(`/api/servers/${serverId}`);
            const data = await res.json();

            serverNameEl.textContent = data.server.name;
            renderChannels(data.channels);
            renderMembers(data.members);

            // Select first text channel
            const firstText = data.channels.find(c => c.type === 'text');
            if (firstText) {
                  switchChannel(firstText.id);
            }
      } catch (err) {
            console.error('Switch server error:', err);
      }
}

// Render Channels
function renderChannels(channels) {
      channelList.innerHTML = '';

      // Sort: Text then Voice, by position
      const textChannels = channels.filter(c => c.type === 'text').sort((a, b) => a.position - b.position);
      const voiceChannels = channels.filter(c => c.type === 'voice').sort((a, b) => a.position - b.position);

      if (textChannels.length > 0) {
            const header = document.createElement('div');
            header.className = 'member-category';
            header.innerHTML = '<h4>TEXT CHANNELS</h4>';
            channelList.appendChild(header);

            textChannels.forEach(c => {
                  const el = document.createElement('div');
                  el.className = 'channel-item';
                  el.dataset.id = c.id;
                  el.innerHTML = `
        <div class="channel-icon"><span class="channel-hash">#</span></div>
        <span class="channel-name">${c.name}</span>
      `;
                  el.addEventListener('click', () => switchChannel(c.id));
                  channelList.appendChild(el);
            });
      }

      if (voiceChannels.length > 0) {
            const header = document.createElement('div');
            header.className = 'member-category';
            header.innerHTML = '<h4>VOICE CHANNELS</h4>';
            channelList.appendChild(header);

            voiceChannels.forEach(c => {
                  const el = document.createElement('div');
                  el.className = 'channel-item voice-channel-item';
                  el.dataset.id = c.id;
                  el.innerHTML = `
        <div class="channel-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <span class="channel-name">${c.name}</span>
        <div class="voice-users" id="voice-users-${c.id}"></div>
      `;
                  el.addEventListener('click', () => {
                        if (window.joinVoiceChannel) window.joinVoiceChannel(c.id, c.name);
                  });
                  channelList.appendChild(el);
            });
      }
}

// Switch Channel
async function switchChannel(channelId) {
      if (currentChannelId === channelId) return;

      // Check if it's a voice channel (don't switch chat view for voice only)
      // Actually, for simplicity, we mostly handle text channel switching here
      const channelEl = document.querySelector(`.channel-item[data-id="${channelId}"]`);
      if (channelEl && channelEl.classList.contains('voice-channel-item')) {
            // It's a voice channel, just return (click handler already called joinVoiceChannel)
            return;
      }

      currentChannelId = channelId;

      // Update Active Class
      document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
      if (channelEl) channelEl.classList.add('active');

      // Update Header
      const channelName = channelEl ? channelEl.querySelector('.channel-name').textContent : 'unknown';
      chatChannelName.textContent = channelName;
      welcomeChannelName.textContent = channelName;
      welcomeChannelName2.textContent = channelName;

      // Join Socket Room
      socket.emit('channel:join', channelId);

      // Load Messages
      await loadMessages(channelId);
}

// Load Messages
async function loadMessages(channelId) {
      messagesList.innerHTML = '';
      // Re-add welcome message
      messagesList.appendChild(document.getElementById('welcome-message'));

      try {
            const res = await fetch(`/api/messages/${channelId}`);
            const data = await res.json();

            data.messages.forEach(msg => {
                  appendMessage(msg);
            });

            scrollToBottom();
      } catch (err) {
            console.error('Load messages error:', err);
      }
}

// Append Message
function appendMessage(msg) {
      const el = document.createElement('div');
      el.className = 'message';

      const date = new Date(msg.created_at);
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const day = date.toLocaleDateString();

      const avatarUrl = msg.avatar ? `url(${msg.avatar})` : '';
      const avatarLetter = msg.username.charAt(0).toUpperCase();

      el.innerHTML = `
    <div class="message-avatar" style="background-image: ${avatarUrl}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
      ${!msg.avatar ? avatarLetter : ''}
    </div>
    <div class="message-content">
      <div class="message-header">
        <span class="message-username">${msg.username}</span>
        <span class="message-time">${day} ${time}</span>
      </div>
      <div class="message-text">${formatMessage(msg.content)}</div>
    </div>
  `;
      messagesList.appendChild(el);
}

function formatMessage(content) {
      // Basic escaping
      const safe = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      // Linkify
      return safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--text-link)">$1</a>');
}

function scrollToBottom() {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send Message
messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const content = messageInput.value.trim();
            if (content && currentChannelId) {
                  socket.emit('message:send', { channelId: currentChannelId, content });
                  messageInput.value = '';
            }
      }
});

// Render Members
function renderMembers(members) {
      onlineMembers.innerHTML = '';
      offlineMembers.innerHTML = '';

      let online = 0;
      let offline = 0;

      members.sort((a, b) => a.username.localeCompare(b.username));

      members.forEach(m => {
            const isOnline = m.status === 'online';
            const el = document.createElement('div');
            el.className = `member-item ${!isOnline ? 'offline' : ''}`;
            el.innerHTML = `
      <div class="member-avatar" style="background-image: ${m.avatar ? `url(${m.avatar})` : 'none'}">
        ${!m.avatar ? `<div class="avatar-placeholder">${m.username[0].toUpperCase()}</div>` : ''}
        <div class="member-status ${m.status}"></div>
      </div>
      <div class="member-name" style="color: ${m.role === 'owner' ? '#bf94ff' : ''}">${m.username}</div>
    `;

            if (isOnline) {
                  onlineMembers.appendChild(el);
                  online++;
            } else {
                  offlineMembers.appendChild(el);
                  offline++;
            }
      });

      onlineCount.textContent = online;
      offlineCount.textContent = offline;
}

// Create Server UI
addServerBtn.addEventListener('click', () => {
      createServerModal.classList.remove('hidden');
});

cancelCreateServerBtn.addEventListener('click', () => {
      createServerModal.classList.add('hidden');
});

confirmCreateServerBtn.addEventListener('click', async () => {
      const name = newServerNameInput.value.trim();
      if (!name) return;

      try {
            const res = await fetch('/api/servers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (res.ok) {
                  createServerModal.classList.add('hidden');
                  loadServers();
            }
      } catch (err) {
            console.error(err);
      }
});

confirmJoinServerBtn.addEventListener('click', async () => {
      const code = joinInviteCodeInput.value.trim();
      if (!code) return;

      try {
            const res = await fetch('/api/servers/join', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ inviteCode: code })
            });
            if (res.ok) {
                  createServerModal.classList.add('hidden');
                  loadServers();
            } else {
                  alert('Invalid invite code');
            }
      } catch (err) {
            console.error(err);
      }
});

// Start the check
if (window.checkAuth) {
      window.checkAuth();
} else {
      // If app.js loads before auth.js (unlikely), wait
      window.addEventListener('load', () => {
            if (window.checkAuth) window.checkAuth();
      });
}
