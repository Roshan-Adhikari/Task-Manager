require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── BOOT ───────────────────────────────────────────────────────────
async function boot() {
  // Initialize database first
  const { initDB } = require('./database/db');
  await initDB();

  // ── ROUTES ─────────────────────────────────────────────────────
  app.use('/auth', require('./routes/auth'));
  app.use('/api/tasks', require('./routes/tasks'));
  app.use('/api/teams', require('./routes/teams'));
  app.use('/api/teams', require('./routes/members'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/tags', require('./routes/tags'));
  app.use('/api/meetings', require('./routes/meetings'));
  app.use('/api/slack', require('./routes/slack'));

  // ── HEALTH CHECK ───────────────────────────────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── SPA FALLBACK ───────────────────────────────────────────────
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ── START SERVER ───────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║       📋 TaskFlow Server Running             ║`);
    console.log(`║       http://localhost:${PORT}                  ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);

    // Start reminder scheduler
    try {
      const { startReminderScheduler } = require('./services/reminderScheduler');
      startReminderScheduler();
    } catch (err) {
      console.error('⚠️  Reminder scheduler failed to start:', err.message);
    }
  });
}

boot().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
