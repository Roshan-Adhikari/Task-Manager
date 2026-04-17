const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL USERS ──────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await queries.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── CREATE/INVITE USER ─────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }
    
    // Check if user already exists
    let existing = await queries.findUserByEmail(email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const result = await queries.createUser(
      email.trim().toLowerCase(),
      name.trim(),
      null, // avatar
      null, // google_id
      role || 'member'
    );
    
    const user = await queries.findUserById(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ── UPDATE USER ────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    await queries.updateUser(name, email, role, parseInt(req.params.id));
    const user = await queries.findUserById(parseInt(req.params.id));
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ── DELETE USER ────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await queries.deleteUser(parseInt(req.params.id));
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
