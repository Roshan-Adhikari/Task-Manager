const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL TAGS ───────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const tags = await queries.getAllTags();
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ── CREATE TAG ─────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Tag name required' });
    
    await queries.createTag(name.trim(), color || '#7c6af7');
    const allTags = await queries.getAllTags();
    res.status(201).json(allTags.find(t => t.name === name.trim()));
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// ── DELETE TAG ─────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await queries.deleteTag(parseInt(req.params.id));
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

module.exports = router;
