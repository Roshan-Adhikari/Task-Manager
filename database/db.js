const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'taskflow.db');

let db = null;
let stmts = null;

// ── INIT DATABASE ──────────────────────────────────────────────────
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      google_id TEXT UNIQUE,
      role TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#7c6af7',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, user_id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      assigned_to INTEGER,
      assigned_to_email TEXT,
      team_id INTEGER,
      due_date DATE,
      tags TEXT DEFAULT '',
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reminder_sent INTEGER DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      field_changed TEXT,
      old_value TEXT,
      new_value TEXT,
      comment TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)'); } catch(e) {}
  try { db.run('CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)'); } catch(e) {}

  saveDB();
  console.log('✅ SQLite database initialized');
  return db;
}

// ── SAVE DB TO DISK ────────────────────────────────────────────────
function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 10 seconds
setInterval(() => {
  try { saveDB(); } catch(e) {}
}, 10000);

// ── QUERY HELPERS ──────────────────────────────────────────────────
// Convert sql.js result rows to array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function runQuery(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 };
}

// ── PREPARED QUERY FUNCTIONS ───────────────────────────────────────

const queries = {
  // Users
  findUserByEmail: (email) => queryOne('SELECT * FROM users WHERE email = ?', [email]),
  findUserByGoogleId: (googleId) => queryOne('SELECT * FROM users WHERE google_id = ?', [googleId]),
  findUserById: (id) => queryOne('SELECT * FROM users WHERE id = ?', [id]),
  createUser: (email, name, avatar_url, google_id, role) =>
    runQuery('INSERT INTO users (email, name, avatar_url, google_id, role) VALUES (?, ?, ?, ?, ?)',
      [email, name, avatar_url, google_id, role]),
  updateUserLogin: (name, avatar_url, id) =>
    runQuery('UPDATE users SET last_login = datetime("now"), name = ?, avatar_url = ? WHERE id = ?',
      [name, avatar_url, id]),
  createInvitedUser: (email, name) =>
    runQuery('INSERT OR IGNORE INTO users (email, name, role) VALUES (?, ?, "member")', [email, name]),
  getAllUsers: () => queryAll('SELECT id, email, name, avatar_url, role, created_at FROM users'),
  updateUserGoogleId: (googleId, avatarUrl, name, id) =>
    runQuery('UPDATE users SET google_id = ?, avatar_url = ?, name = ? WHERE id = ?',
      [googleId, avatarUrl, name, id]),

  // Teams
  getAllTeams: () => queryAll('SELECT * FROM teams ORDER BY created_at DESC'),
  getTeamById: (id) => queryOne('SELECT * FROM teams WHERE id = ?', [id]),
  createTeam: (name, color, createdBy) =>
    runQuery('INSERT INTO teams (name, color, created_by) VALUES (?, ?, ?)', [name, color, createdBy]),
  updateTeam: (name, color, id) =>
    runQuery('UPDATE teams SET name = ?, color = ? WHERE id = ?', [name, color, id]),
  deleteTeam: (id) => runQuery('DELETE FROM teams WHERE id = ?', [id]),

  // Team Members
  getTeamMembers: (teamId) => queryAll(`
    SELECT tm.*, u.email, u.name, u.avatar_url, u.role as user_role
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
  `, [teamId]),
  addTeamMember: (teamId, userId, role) =>
    runQuery('INSERT OR IGNORE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', [teamId, userId, role]),
  removeTeamMember: (teamId, userId) =>
    runQuery('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]),
  isTeamMember: (teamId, userId) =>
    queryOne('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]),

  // Tasks
  getAllTasks: () => queryAll(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_email, u1.avatar_url as assigned_avatar,
      u2.name as created_by_name, u2.email as creator_email,
      te.name as team_name, te.color as team_color
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = t.created_by
    LEFT JOIN teams te ON te.id = t.team_id
    ORDER BY
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
      t.created_at DESC
  `),
  getTaskById: (id) => queryOne(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_email,
      u2.name as created_by_name,
      te.name as team_name, te.color as team_color
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = t.created_by
    LEFT JOIN teams te ON te.id = t.team_id
    WHERE t.id = ?
  `, [id]),
  getTasksByUser: (userId) => queryAll(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_email,
      u2.name as created_by_name,
      te.name as team_name, te.color as team_color
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = t.created_by
    LEFT JOIN teams te ON te.id = t.team_id
    WHERE t.assigned_to = ? OR t.created_by = ?
    ORDER BY t.created_at DESC
  `, [userId, userId]),
  createTask: (title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, createdBy) =>
    runQuery(`INSERT INTO tasks (title, description, status, priority, assigned_to, assigned_to_email, team_id, due_date, tags, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, createdBy]),
  updateTask: (title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, id) =>
    runQuery(`UPDATE tasks SET title=?, description=?, status=?, priority=?, assigned_to=?,
      assigned_to_email=?, team_id=?, due_date=?, tags=?, updated_at=datetime("now"), reminder_sent=0
      WHERE id=?`,
      [title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, id]),
  deleteTask: (id) => runQuery('DELETE FROM tasks WHERE id = ?', [id]),
  getOverdueTasks: () => queryAll(`
    SELECT t.*, u.name as assigned_to_name, u.email as assigned_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date <= date('now')
      AND t.reminder_sent = 0
  `),
  getPendingTasks: () => queryAll(`
    SELECT t.*, u.name as assigned_to_name, u.email as assigned_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date <= date('now', '+1 day')
  `),
  markReminderSent: (id) => runQuery('UPDATE tasks SET reminder_sent = 1 WHERE id = ?', [id]),

  // Task Updates (Activity Log)
  getTaskUpdates: (taskId) => queryAll(`
    SELECT tu.*, u.name as user_name, u.email as user_email
    FROM task_updates tu
    JOIN users u ON u.id = tu.user_id
    WHERE tu.task_id = ?
    ORDER BY tu.created_at DESC
  `, [taskId]),
  getRecentUpdates: (limit) => queryAll(`
    SELECT tu.*, u.name as user_name, t.title as task_title
    FROM task_updates tu
    JOIN users u ON u.id = tu.user_id
    JOIN tasks t ON t.id = tu.task_id
    ORDER BY tu.created_at DESC
    LIMIT ?
  `, [limit]),
  createTaskUpdate: (taskId, userId, fieldChanged, oldValue, newValue, comment) =>
    runQuery(`INSERT INTO task_updates (task_id, user_id, field_changed, old_value, new_value, comment)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, userId, fieldChanged, oldValue, newValue, comment]),
};

module.exports = { initDB, saveDB, queryAll, queryOne, runQuery, queries, getDB: () => db };
