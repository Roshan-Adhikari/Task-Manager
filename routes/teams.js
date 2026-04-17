const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL TEAMS ──────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const teams = queries.getAllTeams();
    const teamsWithCount = teams.map(t => {
      const members = queries.getTeamMembers(t.id);
      return { ...t, member_count: members.length, members };
    });
    res.json(teamsWithCount);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// ── GET SINGLE TEAM ────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = queries.getTeamMembers(teamId);
    res.json({ ...team, members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// ── CREATE TEAM ────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const result = queries.createTeam(name.trim(), color || '#7c6af7', req.user.id);
    const teamId = result.lastInsertRowid;

    // Add creator as admin member
    queries.addTeamMember(teamId, req.user.id, 'admin');

    const team = queries.getTeamById(teamId);
    const members = queries.getTeamMembers(teamId);
    res.status(201).json({ ...team, members });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// ── UPDATE TEAM ────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { name, color } = req.body;
    queries.updateTeam(name || team.name, color || team.color, teamId);

    const updated = queries.getTeamById(teamId);
    const members = queries.getTeamMembers(teamId);
    res.json({ ...updated, members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// ── DELETE TEAM ────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    const team = queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    queries.deleteTeam(teamId);
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

module.exports = router;
