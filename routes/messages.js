const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Get messages for a channel
router.get('/:channelId', auth, (req, res) => {
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found' });

      const member = db.prepare('SELECT * FROM members WHERE server_id = ? AND user_id = ?').get(channel.server_id, req.user.id);
      if (!member) return res.status(403).json({ error: 'Not a member' });

      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const before = req.query.before;

      let messages;
      if (before) {
            messages = db.prepare(`
      SELECT m.*, u.username, u.avatar FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ? AND m.created_at < ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(req.params.channelId, before, limit);
      } else {
            messages = db.prepare(`
      SELECT m.*, u.username, u.avatar FROM messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(req.params.channelId, limit);
      }

      res.json({ messages: messages.reverse() });
});

module.exports = router;
