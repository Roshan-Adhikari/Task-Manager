const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL TEAMS ──────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const teams = await queries.getAllTeams();
    const teamsWithCount = await Promise.all(teams.map(async t => {
      const members = await queries.getTeamMembers(t.id);
      return { ...t, member_count: members.length, members };
    }));
    res.json(teamsWithCount);
  } catch (err) {
    console.error('Get teams error:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// ── GET SINGLE TEAM ────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = await queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = await queries.getTeamMembers(teamId);
    res.json({ ...team, members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// ── CREATE TEAM ────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const result = await queries.createTeam(name.trim(), color || '#7c6af7', req.user.id);
    const teamId = result.lastInsertRowid;

    // Add creator as admin member
    await queries.addTeamMember(teamId, req.user.id, 'admin');

    const team = await queries.getTeamById(teamId);
    const members = await queries.getTeamMembers(teamId);
    res.status(201).json({ ...team, members });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// ── UPDATE TEAM ────────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = await queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { name, color } = req.body;
    await queries.updateTeam(name || team.name, color || team.color, teamId);

    const updated = await queries.getTeamById(teamId);
    const members = await queries.getTeamMembers(teamId);
    res.json({ ...updated, members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// ── DELETE TEAM ────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = await queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await queries.deleteTeam(teamId);
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

module.exports = router;
