const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendInviteEmail } = require('../services/emailService');

const router = express.Router();

// ── GET TEAM MEMBERS ───────────────────────────────────────────────
router.get('/:teamId/members', authMiddleware, (req, res) => {
  try {
    const members = queries.getTeamMembers(parseInt(req.params.teamId));
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ── ADD MEMBER BY EMAIL ────────────────────────────────────────────
router.post('/:teamId/members', authMiddleware, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const teamId = parseInt(req.params.teamId);
    const team = queries.getTeamById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Find or create user by email
    let user = queries.findUserByEmail(email.trim().toLowerCase());

    if (!user) {
      // Create invited user
      const nameFromEmail = email.split('@')[0].replace(/[._]/g, ' ');
      queries.createInvitedUser(email.trim().toLowerCase(), nameFromEmail);
      user = queries.findUserByEmail(email.trim().toLowerCase());

      // Send invite email
      try {
        await sendInviteEmail(email.trim(), team.name, req.user.name);
      } catch (mailErr) {
        console.error('Failed to send invite email:', mailErr.message);
      }
    }

    if (!user) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Check if already a member
    const existing = queries.isTeamMember(teamId, user.id);
    if (existing) {
      return res.status(400).json({ error: 'User is already a team member' });
    }

    // Add to team
    queries.addTeamMember(teamId, user.id, role || 'member');

    const members = queries.getTeamMembers(teamId);
    res.status(201).json({ message: `${email} added to team`, members });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ── REMOVE MEMBER ──────────────────────────────────────────────────
router.delete('/:teamId/members/:userId', authMiddleware, (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const userId = parseInt(req.params.userId);
    queries.removeTeamMember(teamId, userId);
    const members = queries.getTeamMembers(teamId);
    res.json({ message: 'Member removed', members });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
