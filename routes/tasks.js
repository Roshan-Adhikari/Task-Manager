const express = require('express');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL TASKS ──────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const tasks = queries.getAllTasks();
    res.json(tasks);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── GET MY TASKS ───────────────────────────────────────────────────
router.get('/my', authMiddleware, (req, res) => {
  try {
    const tasks = queries.getTasksByUser(req.user.id);
    res.json(tasks);
  } catch (err) {
    console.error('Get my tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ── GET OVERDUE TASKS ──────────────────────────────────────────────
router.get('/overdue', authMiddleware, (req, res) => {
  try {
    const tasks = queries.getOverdueTasks();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch overdue tasks' });
  }
});

// ── GET RECENT ACTIVITY ────────────────────────────────────────────
router.get('/activity', authMiddleware, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const updates = queries.getRecentUpdates(limit);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// ── GET SINGLE TASK ────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const task = queries.getTaskById(parseInt(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const updates = queries.getTaskUpdates(parseInt(req.params.id));
    res.json({ ...task, updates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ── CREATE TASK ────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const { title, description, status, priority, assigned_to, assigned_to_email, team_id, due_date, tags } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    // Resolve assigned_to from email if needed
    let assignedUserId = assigned_to || null;
    let assignedEmail = assigned_to_email || null;

    if (assigned_to_email && !assigned_to) {
      const user = queries.findUserByEmail(assigned_to_email);
      if (user) {
        assignedUserId = user.id;
        assignedEmail = user.email;
      }
    }

    if (assignedUserId && !assignedEmail) {
      const user = queries.findUserById(assignedUserId);
      if (user) assignedEmail = user.email;
    }

    const result = queries.createTask(
      title.trim(),
      description || '',
      status || 'todo',
      priority || 'medium',
      assignedUserId,
      assignedEmail,
      team_id || null,
      due_date || null,
      tags || '',
      req.user.id
    );

    // Log creation
    queries.createTaskUpdate(
      result.lastInsertRowid,
      req.user.id,
      'created',
      '',
      title.trim(),
      'Task created'
    );

    const task = queries.getTaskById(result.lastInsertRowid);
    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ── UPDATE TASK ────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const existing = queries.getTaskById(taskId);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const { title, description, status, priority, assigned_to, assigned_to_email, team_id, due_date, tags } = req.body;

    // Resolve assigned_to from email
    let assignedUserId = assigned_to !== undefined ? assigned_to : existing.assigned_to;
    let assignedEmail = assigned_to_email || existing.assigned_to_email;

    if (assigned_to_email && !assigned_to) {
      const user = queries.findUserByEmail(assigned_to_email);
      if (user) {
        assignedUserId = user.id;
        assignedEmail = user.email;
      }
    }

    if (assignedUserId && !assignedEmail) {
      const user = queries.findUserById(assignedUserId);
      if (user) assignedEmail = user.email;
    }

    // Track changes for activity log
    const changes = [];
    const newTitle = title !== undefined ? title : existing.title;
    const newStatus = status !== undefined ? status : existing.status;
    const newPriority = priority !== undefined ? priority : existing.priority;
    const newDueDate = due_date !== undefined ? due_date : existing.due_date;

    if (title && title !== existing.title) changes.push({ field: 'title', old: existing.title, new: title });
    if (status && status !== existing.status) changes.push({ field: 'status', old: existing.status, new: status });
    if (priority && priority !== existing.priority) changes.push({ field: 'priority', old: existing.priority, new: priority });
    if (due_date !== undefined && due_date !== existing.due_date) changes.push({ field: 'due_date', old: existing.due_date || '', new: due_date || '' });
    if (assigned_to_email && assigned_to_email !== existing.assigned_to_email) changes.push({ field: 'assigned_to', old: existing.assigned_to_email || '', new: assigned_to_email });

    queries.updateTask(
      newTitle,
      description !== undefined ? description : existing.description,
      newStatus,
      newPriority,
      assignedUserId,
      assignedEmail,
      team_id !== undefined ? team_id : existing.team_id,
      newDueDate,
      tags !== undefined ? tags : existing.tags,
      taskId
    );

    // Log each change
    for (const change of changes) {
      queries.createTaskUpdate(taskId, req.user.id, change.field, change.old || '', change.new || '', '');
    }

    if (changes.length === 0) {
      queries.createTaskUpdate(taskId, req.user.id, 'updated', '', '', 'Task details updated');
    }

    const task = queries.getTaskById(taskId);
    res.json(task);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ── DELETE TASK ─────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const task = queries.getTaskById(parseInt(req.params.id));
    if (!task) return res.status(404).json({ error: 'Task not found' });

    queries.deleteTask(parseInt(req.params.id));
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
