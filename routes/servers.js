const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user's servers
router.get('/', auth, (req, res) => {
      const servers = db.prepare(`
    SELECT s.* FROM servers s
    JOIN members m ON m.server_id = s.id
    WHERE m.user_id = ?
    ORDER BY s.created_at ASC
  `).all(req.user.id);
      res.json({ servers });
});

// Create server
router.post('/', auth, (req, res) => {
      try {
            const { name } = req.body;
            if (!name || name.length < 1 || name.length > 100) {
                  return res.status(400).json({ error: 'Server name must be 1-100 characters' });
            }

            const serverId = uuidv4();
            const inviteCode = uuidv4().split('-')[0];

            db.prepare('INSERT INTO servers (id, name, owner_id, invite_code) VALUES (?, ?, ?, ?)').run(serverId, name, req.user.id, inviteCode);
            db.prepare('INSERT INTO members (server_id, user_id, role) VALUES (?, ?, ?)').run(serverId, req.user.id, 'owner');

            // Create default channels
            const generalId = uuidv4();
            const voiceId = uuidv4();
            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(generalId, serverId, 'general', 'text', 0);
            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(voiceId, serverId, 'General', 'voice', 1);

            const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
            res.json({ server });
      } catch (err) {
            console.error('Create server error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Get server details
router.get('/:serverId', auth, (req, res) => {
      const member = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(req.params.serverId, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });

      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
      const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC').all(req.params.serverId);
      const members = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.status, m.role FROM members m
    JOIN users u ON u.id = m.user_id
    WHERE m.server_id = ?
  `).all(req.params.serverId);

      res.json({ server, channels, members });
});

// Get server channels
router.get('/:serverId/channels', auth, (req, res) => {
      const member = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(req.params.serverId, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });

      const channels = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC').all(req.params.serverId);
      res.json({ channels });
});

// Create channel
router.post('/:serverId/channels', auth, (req, res) => {
      try {
            const member = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(req.params.serverId, req.user.id);
            if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
                  return res.status(403).json({ error: 'Not authorized' });
            }

            const { name, type } = req.body;
            if (!name) return res.status(400).json({ error: 'Channel name required' });

            const channelId = uuidv4();
            const channelType = type === 'voice' ? 'voice' : 'text';
            const maxPos = db.prepare('SELECT MAX(position) as max FROM channels WHERE server_id = ?').get(req.params.serverId);

            db.prepare('INSERT INTO channels (id, server_id, name, type, position) VALUES (?, ?, ?, ?, ?)').run(channelId, req.params.serverId, name, channelType, (maxPos?.max || 0) + 1);

            const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
            res.json({ channel });
      } catch (err) {
            console.error('Create channel error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Join server by invite
router.post('/join', auth, (req, res) => {
      try {
            const { inviteCode } = req.body;
            const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(inviteCode);
            if (!server) return res.status(404).json({ error: 'Invalid invite code' });

            const existing = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(server.id, req.user.id);
            if (existing) return res.status(400).json({ error: 'Already a member' });

            db.prepare('INSERT INTO members (server_id, user_id) VALUES (?, ?)').run(server.id, req.user.id);
            res.json({ server });
      } catch (err) {
            console.error('Join server error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Leave server
router.post('/:serverId/leave', auth, (req, res) => {
      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
      if (server && server.owner_id === req.user.id) {
            return res.status(400).json({ error: 'Owner cannot leave. Transfer or delete the server.' });
      }
      db.prepare('DELETE FROM members WHERE server_id = ? AND user_id = ?').run(req.params.serverId, req.user.id);
      res.json({ success: true });
});

// Delete server
router.delete('/:serverId', auth, (req, res) => {
      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
      if (!server || server.owner_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
      }
      db.prepare('DELETE FROM messages WHERE channel_id IN (SELECT id FROM channels WHERE server_id = ?)').run(req.params.serverId);
      db.prepare('DELETE FROM channels WHERE server_id = ?').run(req.params.serverId);
      db.prepare('DELETE FROM members WHERE server_id = ?').run(req.params.serverId);
      db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.serverId);
      res.json({ success: true });
});

module.exports = router;
