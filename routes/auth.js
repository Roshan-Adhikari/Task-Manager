const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GOOGLE TOKEN VERIFICATION ──────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential token required' });
    }

    // Handle demo mode
    if (credential === 'DEMO_MODE') {
      // Create or find demo user
      let user = await queries.findUserByEmail('demo@taskflow.local');
      if (!user) {
        const allUsers = await queries.getAllUsers();
        const role = allUsers.length === 0 ? 'admin' : 'member';
        await queries.createUser('demo@taskflow.local', 'Demo User', null, 'demo', role);
        user = await queries.findUserByEmail('demo@taskflow.local');
      }
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role, avatar_url: user.avatar_url },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ token, user });
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await queries.findUserByGoogleId(googleId);

    if (!user) {
      // Check if email already exists (invited user)
      user = await queries.findUserByEmail(email);
      if (user) {
        // Update existing invited user with Google ID
        await queries.updateUserGoogleId(googleId, picture, name, user.id);
        user = await queries.findUserById(user.id);
      } else {
        // Determine role — first user or admin email becomes admin
        const allUsers = await queries.getAllUsers();
        const isAdmin = allUsers.length === 0 || email === process.env.ADMIN_EMAIL;
        const role = isAdmin ? 'admin' : 'member';

        const result = await queries.createUser(email, name, picture, googleId, role);
        user = await queries.findUserById(result.lastInsertRowid);
      }
    } else {
      // Update login timestamp and info
      await queries.updateUserLogin(name, picture, user.id);
      user = await queries.findUserById(user.id);
    }

    // Issue JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, avatar_url: user.avatar_url },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        role: user.role,
        last_login: user.last_login,
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
});

// ── GET CURRENT USER ───────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  const user = await queries.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    role: user.role,
    last_login: user.last_login,
  });
});

// ── GET ALL USERS (for assignment dropdown) ────────────────────────
router.get('/users', authMiddleware, async (req, res) => {
  const users = await queries.getAllUsers();
  res.json(users);
});

module.exports = router;
