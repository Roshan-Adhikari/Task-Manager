const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set!');
    process.exit(1);
  }

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  return pool;
}

// ── INIT DATABASE ──────────────────────────────────────────────────
async function initDB() {
  const db = getPool();

  // Create tables using PostgreSQL syntax
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      google_id TEXT UNIQUE,
      role TEXT DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#7c6af7',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(team_id, user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_to_email TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      due_date DATE,
      tags TEXT DEFAULT '',
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      reminder_sent INTEGER DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS task_updates (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      field_changed TEXT,
      old_value TEXT,
      new_value TEXT,
      comment TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create indexes
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id)'); } catch(e) {}
  try { await db.query('CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)'); } catch(e) {}

  console.log('✅ PostgreSQL database initialized');
}

// ── QUERY HELPERS ──────────────────────────────────────────────────
async function queryAll(sql, params = []) {
  const db = getPool();
  const res = await db.query(sql, params);
  return res.rows;
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

async function runQuery(sql, params = []) {
  const db = getPool();
  const res = await db.query(sql, params);
  // Normalize result to return id consistently
  return { lastInsertRowid: res.rows[0]?.id || 0, rowCount: res.rowCount };
}

// ── PREPARED QUERY FUNCTIONS ───────────────────────────────────────

const queries = {
  // Users
  findUserByEmail: async (email) => queryOne('SELECT * FROM users WHERE email = $1', [email]),
  findUserByGoogleId: async (googleId) => queryOne('SELECT * FROM users WHERE google_id = $1', [googleId]),
  findUserById: async (id) => queryOne('SELECT * FROM users WHERE id = $1', [id]),
  createUser: async (email, name, avatar_url, google_id, role) => {
    const res = await getPool().query(
      'INSERT INTO users (email, name, avatar_url, google_id, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [email, name, avatar_url, google_id, role]
    );
    return { lastInsertRowid: res.rows[0].id };
  },
  updateUserLogin: async (name, avatar_url, id) =>
    runQuery('UPDATE users SET last_login = CURRENT_TIMESTAMP, name = $1, avatar_url = $2 WHERE id = $3',
      [name, avatar_url, id]),
  createInvitedUser: async (email, name) =>
    runQuery('INSERT INTO users (email, name, role) VALUES ($1, $2, "member") ON CONFLICT (email) DO NOTHING', [email, name]),
  getAllUsers: async () => queryAll('SELECT id, email, name, avatar_url, role, created_at FROM users'),
  updateUserGoogleId: async (googleId, avatarUrl, name, id) =>
    runQuery('UPDATE users SET google_id = $1, avatar_url = $2, name = $3 WHERE id = $4',
      [googleId, avatarUrl, name, id]),

  // Teams
  getAllTeams: async () => queryAll('SELECT * FROM teams ORDER BY created_at DESC'),
  getTeamById: async (id) => queryOne('SELECT * FROM teams WHERE id = $1', [id]),
  createTeam: async (name, color, createdBy) => {
    const res = await getPool().query(
      'INSERT INTO teams (name, color, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, color, createdBy]
    );
    return { lastInsertRowid: res.rows[0].id };
  },
  updateTeam: async (name, color, id) =>
    runQuery('UPDATE teams SET name = $1, color = $2 WHERE id = $3', [name, color, id]),
  deleteTeam: async (id) => runQuery('DELETE FROM teams WHERE id = $1', [id]),

  // Team Members
  getTeamMembers: async (teamId) => queryAll(`
    SELECT tm.*, u.email, u.name, u.avatar_url, u.role as user_role
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = $1
  `, [teamId]),
  addTeamMember: async (teamId, userId, role) =>
    runQuery('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (team_id, user_id) DO NOTHING', [teamId, userId, role]),
  removeTeamMember: async (teamId, userId) =>
    runQuery('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]),
  isTeamMember: async (teamId, userId) =>
    queryOne('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]),

  // Tasks
  getAllTasks: async () => queryAll(`
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
  getTaskById: async (id) => queryOne(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_email,
      u2.name as created_by_name,
      te.name as team_name, te.color as team_color
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = t.created_by
    LEFT JOIN teams te ON te.id = t.team_id
    WHERE t.id = $1
  `, [id]),
  getTasksByUser: async (userId) => queryAll(`
    SELECT t.*,
      u1.name as assigned_to_name, u1.email as assigned_email,
      u2.name as created_by_name,
      te.name as team_name, te.color as team_color
    FROM tasks t
    LEFT JOIN users u1 ON u1.id = t.assigned_to
    LEFT JOIN users u2 ON u2.id = t.created_by
    LEFT JOIN teams te ON te.id = t.team_id
    WHERE t.assigned_to = $1 OR t.created_by = $2
    ORDER BY t.created_at DESC
  `, [userId, userId]),
  createTask: async (title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, createdBy) => {
    const res = await getPool().query(
      `INSERT INTO tasks (title, description, status, priority, assigned_to, assigned_to_email, team_id, due_date, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, createdBy]
    );
    return { lastInsertRowid: res.rows[0].id };
  },
  updateTask: async (title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, id) =>
    runQuery(`UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4, assigned_to=$5,
      assigned_to_email=$6, team_id=$7, due_date=$8, tags=$9, updated_at=CURRENT_TIMESTAMP, reminder_sent=0
      WHERE id=$10`,
      [title, description, status, priority, assignedTo, assignedEmail, teamId, dueDate, tags, id]),
  deleteTask: async (id) => runQuery('DELETE FROM tasks WHERE id = $1', [id]),
  getOverdueTasks: async () => queryAll(`
    SELECT t.*, u.name as assigned_to_name, u.email as assigned_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date <= CURRENT_DATE
      AND t.reminder_sent = 0
  `),
  getPendingTasks: async () => queryAll(`
    SELECT t.*, u.name as assigned_to_name, u.email as assigned_email
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date <= (CURRENT_DATE + INTERVAL '1 day')
  `),
  markReminderSent: async (id) => runQuery('UPDATE tasks SET reminder_sent = 1 WHERE id = $1', [id]),

  // Task Updates (Activity Log)
  getTaskUpdates: async (taskId) => queryAll(`
    SELECT tu.*, u.name as user_name, u.email as user_email
    FROM task_updates tu
    JOIN users u ON u.id = tu.user_id
    WHERE tu.task_id = $1
    ORDER BY tu.created_at DESC
  `, [taskId]),
  getRecentUpdates: async (limit) => queryAll(`
    SELECT tu.*, u.name as user_name, t.title as task_title
    FROM task_updates tu
    JOIN users u ON u.id = tu.user_id
    JOIN tasks t ON t.id = tu.task_id
    ORDER BY tu.created_at DESC
    LIMIT $1
  `, [limit]),
  createTaskUpdate: async (taskId, userId, fieldChanged, oldValue, newValue, comment) =>
    runQuery(`INSERT INTO task_updates (task_id, user_id, field_changed, old_value, new_value, comment)
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [taskId, userId, fieldChanged, oldValue, newValue, comment]),
};

module.exports = { initDB, queryAll, queryOne, runQuery, queries, getPool };
