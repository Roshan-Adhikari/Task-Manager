const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { sendMeetingInvite } = require('../services/emailService');

const router = express.Router();

// GET all meetings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const meetings = await queries.getAllMeetings();
    res.json(meetings);
  } catch (err) {
    console.error('Get meetings error:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// CREATE meeting
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, meeting_date, start_time, end_time, meet_link, team_id, attendees } = req.body;

    if (!title || !meeting_date || !start_time) {
      return res.status(400).json({ error: 'Title, date and start time are required' });
    }

    const result = await queries.createMeeting(
      title, description || '', meeting_date, start_time,
      end_time || '', meet_link || '', team_id || null,
      attendees || '', req.user.id
    );

    const meeting = await queries.getMeetingById(result.lastInsertRowid);

    // Send ICS calendar invites to all attendees + organizer
    try {
      const organizer = await queries.findUserById(req.user.id);
      if (organizer && process.env.EMAIL_USER) {
        await sendMeetingInvite(meeting, organizer.email, organizer.name);
        console.log(`📅 Calendar invites sent for meeting: ${title}`);
      }
    } catch (emailErr) {
      console.error('Calendar invite email error (non-blocking):', emailErr.message);
    }

    res.status(201).json(meeting);
  } catch (err) {
    console.error('Create meeting error:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// DELETE meeting
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await queries.deleteMeeting(parseInt(req.params.id));
    res.json({ message: 'Meeting deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

module.exports = router;
