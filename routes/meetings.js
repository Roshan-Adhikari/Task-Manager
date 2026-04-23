const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

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
