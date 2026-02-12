const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
      try {
            const { username, email, password } = req.body;
            if (!username || !email || !password) {
                  return res.status(400).json({ error: 'All fields are required' });
            }
            if (username.length < 3 || username.length > 32) {
                  return res.status(400).json({ error: 'Username must be 3-32 characters' });
            }
            if (password.length < 6) {
                  return res.status(400).json({ error: 'Password must be at least 6 characters' });
            }

            const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
            if (existing) {
                  return res.status(409).json({ error: 'Email or username already taken' });
            }

            const hashedPassword = bcrypt.hashSync(password, 12);
            const userId = uuidv4();

            db.prepare('INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)').run(userId, username, email, hashedPassword);

            // Auto-join the General server
            const generalServer = db.prepare('SELECT id FROM servers WHERE name = ?').get('General');
            if (generalServer) {
                  db.prepare('INSERT OR IGNORE INTO members (server_id, user_id) VALUES (?, ?)').run(generalServer.id, userId);
            }

            const token = jwt.sign({ id: userId, username }, process.env.JWT_SECRET, { expiresIn: '30d' });

            res.cookie('token', token, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax',
                  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                  path: '/'
            });

            res.json({ user: { id: userId, username, email, avatar: null, status: 'online' } });
      } catch (err) {
            console.error('Register error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Login
router.post('/login', (req, res) => {
      try {
            const { email, password } = req.body;
            if (!email || !password) {
                  return res.status(400).json({ error: 'All fields are required' });
            }

            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (!user) {
                  return res.status(401).json({ error: 'Invalid credentials' });
            }

            const valid = bcrypt.compareSync(password, user.password);
            if (!valid) {
                  return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '30d' });

            res.cookie('token', token, {
                  httpOnly: true,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax',
                  maxAge: 30 * 24 * 60 * 60 * 1000,
                  path: '/'
            });

            db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', user.id);

            res.json({
                  user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        avatar: user.avatar,
                        status: 'online',
                        custom_status: user.custom_status
                  }
            });
      } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Server error' });
      }
});

// Logout
router.post('/logout', auth, (req, res) => {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', req.user.id);
      res.clearCookie('token', { path: '/' });
      res.json({ success: true });
});

// Get current user
router.get('/me', auth, (req, res) => {
      const user = db.prepare('SELECT id, username, email, avatar, status, custom_status FROM users WHERE id = ?').get(req.user.id);
      if (!user) {
            res.clearCookie('token', { path: '/' });
            return res.status(401).json({ error: 'User not found' });
      }
      res.json({ user });
});

module.exports = router;
