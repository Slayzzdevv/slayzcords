const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/profile', auth, (req, res) => {
      const user = db.prepare('SELECT id, username, email, avatar, status, custom_status, created_at FROM users WHERE id = ?').get(req.user.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ user });
});

// Update profile
router.patch('/profile', auth, (req, res) => {
      try {
            const { username, custom_status, avatar } = req.body;

            if (username !== undefined) {
                  if (username.length < 3 || username.length > 32) {
                        return res.status(400).json({ error: 'Username must be 3-32 characters' });
                  }
                  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
                  if (existing) return res.status(409).json({ error: 'Username already taken' });
                  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
            }

            if (custom_status !== undefined) {
                  db.prepare('UPDATE users SET custom_status = ? WHERE id = ?').run(custom_status, req.user.id);
            }

            if (avatar !== undefined) {
                  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
            }

            const user = db.prepare('SELECT id, username, email, avatar, status, custom_status FROM users WHERE id = ?').get(req.user.id);
            res.json({ user });
      } catch (err) {
            console.error('Update profile error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Change password
router.post('/change-password', auth, (req, res) => {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Both passwords required' });
      }
      if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
      if (!bcrypt.compareSync(currentPassword, user.password)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hashed = bcrypt.hashSync(newPassword, 12);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
      res.json({ success: true });
});

// Search users
router.get('/search', auth, (req, res) => {
      const { q } = req.query;
      if (!q || q.length < 2) return res.json({ users: [] });
      const users = db.prepare('SELECT id, username, avatar, status FROM users WHERE username LIKE ? AND id != ? LIMIT 20').all(`%${q}%`, req.user.id);
      res.json({ users });
});

// Get all users (for member list)
router.get('/all', auth, (req, res) => {
      const users = db.prepare('SELECT id, username, avatar, status FROM users').all();
      res.json({ users });
});

module.exports = router;
