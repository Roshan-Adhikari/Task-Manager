// ═══════════════════════════════════════════════════════════
//  TASKFLOW — Frontend Application
//  Connected to Node.js/Express backend with SQLite
// ═══════════════════════════════════════════════════════════

const GOOGLE_CLIENT_ID = '499606167028-05437cd7m6lcued0p20qvjjn5hlgq3ds.apps.googleusercontent.com';
const API_BASE = '';  // Same origin

// ── STATE ──────────────────────────────────────────────────
let currentUser = null;
let authToken = localStorage.getItem('taskflow_token');
let tasks = [];
let teams = [];
let allUsers = [];
let editingTaskId = null;
let editingGroupId = null;
let currentFilter = 'all';
let currentStatus = 'all';
let currentPriority = 'all';
let currentView = 'board';
let selectedColor = '#7c6af7';

const GROUP_COLORS = [
  '#7c6af7','#3ecf8e','#f59f00','#f03e3e',
  '#4dabf7','#f783ac','#38d9a9','#ffa94d',
  '#a9e34b','#cc5de8'
];

// ═══════════════════════════════════════════════════════════
//  API HELPERS
// ═══════════════════════════════════════════════════════════

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  setSyncPending();
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) {
      // Token expired
      TF.logout();
      showToast('Session expired. Please sign in again.', 'error');
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    setSyncDone();
    return data;
  } catch (err) {
    setSyncError();
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

// Initialize Google Sign-In
function initGoogleAuth() {
  if (typeof google === 'undefined') {
    // GSI library not loaded yet, retry
    setTimeout(initGoogleAuth, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
    auto_select: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    {
      theme: 'filled_black',
      size: 'large',
      width: 320,
      text: 'continue_with',
      shape: 'rectangular',
    }
  );
}

async function handleGoogleCredential(response) {
  try {
    showToast('Signing in…', 'info');
    const data = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    }).then(r => r.json());

    if (data.error) {
      showToast('Sign in failed: ' + data.error, 'error');
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('taskflow_token', authToken);

    enterApp();
    showToast(`Welcome back, ${currentUser.name}!`, 'success');
  } catch (err) {
    showToast('Sign in failed: ' + err.message, 'error');
  }
}

// Try auto-login from stored token
async function tryAutoLogin() {
  if (!authToken) return false;
  try {
    currentUser = await api('/auth/me');
    return true;
  } catch {
    authToken = null;
    localStorage.removeItem('taskflow_token');
    return false;
  }
}

// Demo login (for testing without Google OAuth)
async function demoLogin() {
  try {
    // Create a demo session via backend
    const res = await fetch('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: 'DEMO_MODE' })
    }).then(r => r.json());

    if (res.error) {
      // Fallback: use local demo mode
      currentUser = { id: 0, name: 'Demo User', email: 'demo@taskflow.local', role: 'admin' };
      authToken = 'demo';
      enterApp();
      showToast('Running in Demo Mode (local only)', 'info');
      return;
    }
    authToken = res.token;
    currentUser = res.user;
    localStorage.setItem('taskflow_token', authToken);
    enterApp();
    showToast(`Welcome, ${currentUser.name}!`, 'success');
  } catch {
    // Full fallback
    currentUser = { id: 0, name: 'Demo User', email: 'demo@taskflow.local', role: 'admin' };
    authToken = 'demo';
    enterApp();
    showToast('Running in Demo Mode (local only)', 'info');
  }
}

function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Set user info in sidebar
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-email').textContent = currentUser.email;
  if (currentUser.avatar_url) {
    document.getElementById('user-av').innerHTML = `<img src="${currentUser.avatar_url}" alt="${currentUser.name}">`;
  } else {
    document.getElementById('user-av').textContent = getInitials(currentUser.name);
  }

  initColorPicker();
  loadData();
}

function logout() {
  currentUser = null;
  authToken = null;
  tasks = [];
  teams = [];
  allUsers = [];
  localStorage.removeItem('taskflow_token');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  showToast('Signed out successfully', 'info');
}

// ═══════════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════════

async function loadData() {
  try {
    // Parallel fetch
    const [tasksData, teamsData, usersData] = await Promise.all([
      api('/api/tasks'),
      api('/api/teams'),
      api('/auth/users'),
    ]);

    tasks = tasksData;
    teams = teamsData;
    allUsers = usersData;

    renderSidebar();
    renderTasks();
    updateStats();
    populateAssigneeDropdown();
    showToast('Data loaded from server ✓', 'success');
  } catch (err) {
    console.error('Load data error:', err);
    if (authToken === 'demo') {
      showToast('Demo mode — data is local only', 'info');
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  SYNC STATUS
// ═══════════════════════════════════════════════════════════

function setSyncPending() {
  document.getElementById('sync-dot').className = 'sync-dot pending';
  document.getElementById('sync-text').textContent = 'Syncing…';
}
function setSyncDone() {
  document.getElementById('sync-dot').className = 'sync-dot';
  document.getElementById('sync-text').textContent = 'Connected';
}
function setSyncError() {
  document.getElementById('sync-dot').className = 'sync-dot error';
  document.getElementById('sync-text').textContent = 'Error';
}

// ═══════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
}

function priorityColor(p) {
  if (p === 'high') return { bg: 'var(--red-bg)', text: 'var(--red)' };
  if (p === 'medium') return { bg: 'var(--amber-bg)', text: 'var(--amber)' };
  return { bg: 'var(--green-bg)', text: 'var(--green)' };
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}
function isToday(due) {
  if (!due) return false;
  return due === new Date().toISOString().split('T')[0];
}

function getTeamById(id) { return teams.find(g => g.id == id); }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════
//  POPULATE ASSIGNEE DROPDOWN
// ═══════════════════════════════════════════════════════════

function populateAssigneeDropdown() {
  const list = document.getElementById('assignee-list');
  if (!list) return; // Wait until datalist exists
  list.innerHTML = '';
  allUsers.forEach(u => {
    list.innerHTML += `<option value="${escapeHtml(u.email)}">${escapeHtml(u.name)}</option>`;
  });
}

// ═══════════════════════════════════════════════════════════
//  FILTERS
// ═══════════════════════════════════════════════════════════

function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.nav-item[data-filter]').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.group-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');

  const titles = { all:'All Tasks', mine:'My Tasks', today:'Due Today', overdue:'Overdue', activity:'Activity Log' };
  document.getElementById('page-title').textContent = titles[f] || f;

  // Toggle views
  if (f === 'activity') {
    document.getElementById('stats-bar').style.display = 'none';
    document.getElementById('filters-bar').style.display = 'none';
    document.getElementById('board-view').style.display = 'none';
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('activity-view').style.display = 'block';
    document.getElementById('add-task-btn').style.display = 'none';
    loadActivity();
  } else {
    document.getElementById('stats-bar').style.display = 'grid';
    document.getElementById('filters-bar').style.display = 'flex';
    document.getElementById('activity-view').style.display = 'none';
    document.getElementById('add-task-btn').style.display = 'flex';
    if (currentView === 'board') {
      document.getElementById('board-view').style.display = 'grid';
      document.getElementById('list-view').style.display = 'none';
    } else {
      document.getElementById('board-view').style.display = 'none';
      document.getElementById('list-view').style.display = 'flex';
    }
    renderTasks();
  }
}

function setGroupFilter(id, el) {
  currentFilter = 'team_' + id;
  document.querySelectorAll('.nav-item[data-filter]').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.group-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  const g = getTeamById(id);
  document.getElementById('page-title').textContent = g?.name || 'Team';

  document.getElementById('stats-bar').style.display = 'grid';
  document.getElementById('filters-bar').style.display = 'flex';
  document.getElementById('activity-view').style.display = 'none';
  document.getElementById('add-task-btn').style.display = 'flex';
  if (currentView === 'board') {
    document.getElementById('board-view').style.display = 'grid';
    document.getElementById('list-view').style.display = 'none';
  } else {
    document.getElementById('board-view').style.display = 'none';
    document.getElementById('list-view').style.display = 'flex';
  }
  renderTasks();
}

function setStatusFilter(s, el) {
  currentStatus = s;
  document.querySelectorAll('.filter-chip[data-status]').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  renderTasks();
}

function setPriorityFilter(p, el) {
  if (currentPriority === p) {
    currentPriority = 'all';
    el.classList.remove('active');
  } else {
    currentPriority = p;
    document.querySelectorAll('.filter-chip[data-priority]').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
  }
  renderTasks();
}

function setView(v, el) {
  currentView = v;
  document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('board-view').style.display = v === 'board' ? 'grid' : 'none';
  document.getElementById('list-view').style.display = v === 'list' ? 'flex' : 'none';
  renderTasks();
}

function getFilteredTasks() {
  let t = [...tasks];
  const search = document.getElementById('search-input').value.toLowerCase();

  // Nav filter
  if (currentFilter === 'mine') {
    t = t.filter(x => x.assigned_to == currentUser?.id || x.created_by == currentUser?.id);
  } else if (currentFilter === 'today') {
    t = t.filter(x => isToday(x.due_date));
  } else if (currentFilter === 'overdue') {
    t = t.filter(x => isOverdue(x.due_date) && x.status !== 'done');
  } else if (currentFilter.startsWith('team_')) {
    const teamId = currentFilter.replace('team_', '');
    t = t.filter(x => x.team_id == teamId);
  }

  // Status
  if (currentStatus !== 'all') t = t.filter(x => x.status === currentStatus);

  // Priority
  if (currentPriority !== 'all') t = t.filter(x => x.priority === currentPriority);

  // Search
  if (search) t = t.filter(x =>
    x.title?.toLowerCase().includes(search) ||
    x.description?.toLowerCase().includes(search) ||
    x.assigned_to_name?.toLowerCase().includes(search) ||
    x.assigned_email?.toLowerCase().includes(search) ||
    x.tags?.toLowerCase().includes(search)
  );

  return t;
}

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════

function renderSidebar() {
  const nav = document.getElementById('groups-nav');
  nav.innerHTML = teams.map(g => {
    const isActive = currentFilter === 'team_' + g.id;
    const taskCount = tasks.filter(t => t.team_id == g.id).length;
    const memberCount = g.members ? g.members.length : 0;
    return `
      <div class="group-item ${isActive ? 'active' : ''}" style="position:relative;">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;" onclick="TF.setGroupFilter('${g.id}',this.parentElement)">
          <div class="group-dot" style="background:${g.color}"></div>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(g.name)}</span>
          <span style="font-size:10px;color:var(--text3);font-family:var(--mono)" title="${memberCount} member(s)">${memberCount}👤</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${taskCount}</span>
        </div>
        <button onclick="event.stopPropagation();TF.openGroupModal(${g.id})" title="Manage team & members"
          style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;transition:all 0.15s;opacity:0.5;"
          onmouseover="this.style.opacity='1';this.style.color='var(--accent2)'"
          onmouseout="this.style.opacity='0.5';this.style.color='var(--text3)'"
        >⚙</button>
      </div>
    `;
  }).join('');

  // Update group select in form
  const sel = document.getElementById('f-group');
  const cur = sel.value;
  sel.innerHTML = '<option value="">No Team</option>' + teams.map(g =>
    `<option value="${g.id}">${escapeHtml(g.name)}</option>`
  ).join('');
  sel.value = cur;
}

function renderTasks() {
  const filtered = getFilteredTasks();
  updateStats();

  if (currentView === 'board') renderBoard(filtered);
  else renderList(filtered);
}

function renderBoard(filtered) {
  const cols = { todo: [], inprogress: [], done: [] };
  filtered.forEach(t => {
    const key = t.status === 'inprogress' ? 'inprogress' : t.status === 'done' ? 'done' : 'todo';
    cols[key].push(t);
  });
  document.getElementById('col-todo').innerHTML = cols.todo.map(taskCard).join('') || emptyCol();
  document.getElementById('col-inprogress').innerHTML = cols.inprogress.map(taskCard).join('') || emptyCol();
  document.getElementById('col-done').innerHTML = cols.done.map(taskCard).join('') || emptyCol();

  document.getElementById('cnt-todo-col').textContent = cols.todo.length;
  document.getElementById('cnt-inp-col').textContent = cols.inprogress.length;
  document.getElementById('cnt-done-col').textContent = cols.done.length;
}

function emptyCol() {
  return '<div class="empty-state" style="padding:30px 10px;font-size:12px;">No tasks here</div>';
}

function taskCard(t) {
  const pc = priorityColor(t.priority);
  const overdue = isOverdue(t.due_date) && t.status !== 'done';
  const dueDisplay = t.due_date ? new Date(t.due_date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
  const assigneeName = t.assigned_to_name || t.assigned_email || '';
  const teamName = t.team_name || '';
  const teamColor = t.team_color || '#7c6af7';

  return `
    <div class="task-card" onclick="TF.openEditModal(${t.id})">
      <div class="task-card-top">
        <div class="task-check ${t.status === 'done' ? 'done' : ''}" onclick="event.stopPropagation();TF.toggleDone(${t.id})"></div>
        <div class="task-title-text ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
        <div class="task-actions">
          <button class="task-action-btn edit" onclick="event.stopPropagation();TF.openEditModal(${t.id})" title="Edit">✏</button>
          <button class="task-action-btn" onclick="event.stopPropagation();TF.deleteTask(${t.id})" title="Delete">🗑</button>
        </div>
      </div>
      ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ''}
      <div class="task-meta">
        <span class="task-badge" style="background:${pc.bg};color:${pc.text}">${t.priority}</span>
        ${teamName ? `<span class="task-badge" style="background:${teamColor}22;color:${teamColor}">${escapeHtml(teamName)}</span>` : ''}
        ${dueDisplay ? `<span class="due-badge" style="${overdue ? 'color:var(--red)' : ''}">📅 ${dueDisplay}</span>` : ''}
        ${assigneeName ? `<div class="task-assignee">
          <div class="assignee-av"${t.assigned_avatar ? '' : ''}>${t.assigned_avatar ? `<img src="${t.assigned_avatar}">` : getInitials(assigneeName)}</div>
        </div>` : ''}
      </div>
      <div class="task-updated">Updated ${timeAgo(t.updated_at)}</div>
    </div>
  `;
}

function renderList(filtered) {
  const lv = document.getElementById('list-view');
  if (!filtered.length) {
    lv.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>No tasks found</div>';
    return;
  }
  lv.innerHTML = filtered.map(t => {
    const pc = priorityColor(t.priority);
    const overdue = isOverdue(t.due_date) && t.status !== 'done';
    const dueDisplay = t.due_date ? new Date(t.due_date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
    const assigneeName = t.assigned_to_name || t.assigned_email || '';
    const teamName = t.team_name || '';
    const teamColor = t.team_color || '#7c6af7';

    return `
      <div class="task-list-item" onclick="TF.openEditModal(${t.id})">
        <div class="task-check ${t.status === 'done' ? 'done' : ''}" onclick="event.stopPropagation();TF.toggleDone(${t.id})"></div>
        <div class="task-list-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
        <div class="task-list-right">
          ${teamName ? `<span class="task-badge" style="background:${teamColor}22;color:${teamColor}">${escapeHtml(teamName)}</span>` : ''}
          <span class="task-badge" style="background:${pc.bg};color:${pc.text}">${t.priority}</span>
          ${dueDisplay ? `<span class="due-badge" style="${overdue ? 'color:var(--red)' : ''}">${dueDisplay}</span>` : ''}
          ${assigneeName ? `<div class="assignee-av">${t.assigned_avatar ? `<img src="${t.assigned_avatar}">` : getInitials(assigneeName)}</div>` : ''}
          <button class="task-action-btn edit" onclick="event.stopPropagation();TF.openEditModal(${t.id})" style="opacity:1">✏</button>
          <button class="task-action-btn" onclick="event.stopPropagation();TF.deleteTask(${t.id})" style="opacity:1">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateStats() {
  document.getElementById('s-total').textContent = tasks.length;
  document.getElementById('s-progress').textContent = tasks.filter(t => t.status === 'inprogress').length;
  document.getElementById('s-done').textContent = tasks.filter(t => t.status === 'done').length;
  document.getElementById('s-overdue').textContent = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done').length;

  document.getElementById('cnt-all').textContent = tasks.length;
  document.getElementById('cnt-mine').textContent = tasks.filter(t => t.assigned_to == currentUser?.id || t.created_by == currentUser?.id).length;
  document.getElementById('cnt-today').textContent = tasks.filter(t => isToday(t.due_date)).length;
  document.getElementById('cnt-overdue').textContent = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done').length;
}

// ═══════════════════════════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════════════════════════

async function loadActivity() {
  const container = document.getElementById('activity-view');
  container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> Loading activity…</div>';

  try {
    const updates = await api('/api/tasks/activity?limit=100');
    if (!updates.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>No activity yet</div>';
      return;
    }
    container.innerHTML = `
      <div class="activity-timeline">
        ${updates.map(u => {
          const fieldLabel = u.field_changed === 'status' ? 'status' :
                            u.field_changed === 'priority' ? 'priority' :
                            u.field_changed === 'assigned_to' ? 'assignee' :
                            u.field_changed === 'created' ? 'created task' :
                            u.field_changed || 'updated';
          const changeText = u.old_value && u.new_value
            ? `changed <span class="field">${fieldLabel}</span> from <span class="value">${escapeHtml(u.old_value)}</span> to <span class="value">${escapeHtml(u.new_value)}</span>`
            : u.new_value
            ? `<span class="field">${fieldLabel}</span>: <span class="value">${escapeHtml(u.new_value)}</span>`
            : `<span class="field">${fieldLabel}</span>`;

          return `
            <div class="activity-item">
              <div class="activity-dot"></div>
              <div class="activity-content">
                <div class="activity-text">
                  <strong>${escapeHtml(u.user_name)}</strong> ${changeText}
                  ${u.task_title ? ` on <strong>"${escapeHtml(u.task_title)}"</strong>` : ''}
                </div>
                <div class="activity-time">${timeAgo(u.created_at)}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div>Failed to load activity</div>';
  }
}

// ═══════════════════════════════════════════════════════════
//  TASK CRUD
// ═══════════════════════════════════════════════════════════

function openTaskModal() {
  editingTaskId = null;
  document.getElementById('modal-title').textContent = 'New Task';
  document.getElementById('f-title').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('f-status').value = 'todo';
  document.getElementById('f-priority').value = 'medium';
  document.getElementById('f-assignee').value = '';
  document.getElementById('f-due').value = '';
  document.getElementById('f-group').value = '';
  document.getElementById('f-tags').value = '';
  document.getElementById('task-activity-section').style.display = 'none';
  document.getElementById('task-modal').classList.add('open');
  populateAssigneeDropdown();
  setTimeout(() => document.getElementById('f-title').focus(), 100);
}

async function openEditModal(id) {
  try {
    const data = await api(`/api/tasks/${id}`);
    editingTaskId = id;
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('f-title').value = data.title || '';
    document.getElementById('f-desc').value = data.description || '';
    document.getElementById('f-status').value = data.status || 'todo';
    document.getElementById('f-priority').value = data.priority || 'medium';
    document.getElementById('f-due').value = data.due_date || '';
    document.getElementById('f-group').value = data.team_id || '';
    document.getElementById('f-tags').value = data.tags || '';

    populateAssigneeDropdown();
    document.getElementById('f-assignee').value = data.assigned_email || data.assigned_to_email || '';

    // Show activity log
    if (data.updates && data.updates.length > 0) {
      document.getElementById('task-activity-section').style.display = 'block';
      document.getElementById('task-activity-list').innerHTML = data.updates.slice(0, 10).map(u => {
        const fieldLabel = u.field_changed || 'updated';
        const changeText = u.old_value && u.new_value
          ? `${fieldLabel}: ${escapeHtml(u.old_value)} → ${escapeHtml(u.new_value)}`
          : u.comment || fieldLabel;
        return `
          <div class="activity-item">
            <div class="activity-dot"></div>
            <div class="activity-content">
              <div class="activity-text"><strong>${escapeHtml(u.user_name)}</strong> — ${changeText}</div>
              <div class="activity-time">${timeAgo(u.created_at)}</div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      document.getElementById('task-activity-section').style.display = 'none';
    }

    document.getElementById('task-modal').classList.add('open');
    renderSidebar();
  } catch (err) {
    showToast('Failed to load task: ' + err.message, 'error');
  }
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
}

async function saveTask() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('Task title is required', 'error'); return; }

  const assigneeVal = document.getElementById('f-assignee').value.trim();
  let assignedTo = null;
  let assignedEmail = null;

  if (assigneeVal) {
    // Check if the input matches any existing user exactly by email
    const user = allUsers.find(u => u.email.toLowerCase() === assigneeVal.toLowerCase());
    if (user) {
      assignedTo = user.id;
      assignedEmail = user.email;
    } else if (assigneeVal.includes('@')) {
      // Freeform email typed
      assignedEmail = assigneeVal;
    } else {
      showToast('Please enter a valid email to assign (or clear it for unassigned)', 'error');
      return;
    }
  }

  const taskData = {
    title,
    description: document.getElementById('f-desc').value.trim(),
    status: document.getElementById('f-status').value,
    priority: document.getElementById('f-priority').value,
    assigned_to: assignedTo,
    assigned_to_email: assignedEmail,
    team_id: document.getElementById('f-group').value || null,
    due_date: document.getElementById('f-due').value || null,
    tags: document.getElementById('f-tags').value.trim(),
  };

  try {
    if (editingTaskId) {
      await api(`/api/tasks/${editingTaskId}`, {
        method: 'PUT',
        body: JSON.stringify(taskData)
      });
      showToast('Task updated ✓', 'success');
    } else {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData)
      });
      showToast('Task created ✓', 'success');
    }

    closeTaskModal();
    await loadData();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted', 'info');
    await loadData();
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

async function toggleDone(id) {
  const t = tasks.find(x => x.id == id);
  if (!t) return;
  const newStatus = t.status === 'done' ? 'todo' : 'done';
  try {
    await api(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (newStatus === 'done') showToast('Task completed! ✓', 'success');
    await loadData();
  } catch (err) {
    showToast('Failed to update: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  TEAMS & MEMBERS
// ═══════════════════════════════════════════════════════════

function openGroupModal(teamId) {
  editingGroupId = teamId || null;

  if (teamId) {
    const team = getTeamById(teamId);
    if (!team) return;
    document.getElementById('group-modal-title').textContent = 'Edit Team';
    document.getElementById('g-name').value = team.name;
    selectedColor = team.color;
    document.getElementById('group-save-btn').textContent = 'Save Team';
    document.getElementById('team-members-section').style.display = 'block';
    renderTeamMembers(teamId);
  } else {
    document.getElementById('group-modal-title').textContent = 'New Team';
    document.getElementById('g-name').value = '';
    selectedColor = GROUP_COLORS[0];
    document.getElementById('group-save-btn').textContent = 'Create Team';
    document.getElementById('team-members-section').style.display = 'none';
  }

  initColorPicker();
  document.getElementById('group-modal').classList.add('open');
  setTimeout(() => document.getElementById('g-name').focus(), 100);
}

function closeGroupModal() {
  document.getElementById('group-modal').classList.remove('open');
  editingGroupId = null;
}

function initColorPicker() {
  const container = document.getElementById('color-pick');
  container.innerHTML = GROUP_COLORS.map(c => `
    <div class="color-dot-btn ${c === selectedColor ? 'selected' : ''}" style="background:${c}"
      onclick="TF.selectColor('${c}',this)"></div>
  `).join('');
}

function selectColor(c, el) {
  selectedColor = c;
  document.querySelectorAll('.color-dot-btn').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
}

async function saveGroup() {
  const name = document.getElementById('g-name').value.trim();
  if (!name) { showToast('Team name required', 'error'); return; }

  try {
    if (editingGroupId) {
      await api(`/api/teams/${editingGroupId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, color: selectedColor })
      });
      showToast(`Team "${name}" updated ✓`, 'success');
    } else {
      const newTeam = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name, color: selectedColor })
      });
      showToast(`Team "${name}" created ✓`, 'success');

      // Reopen to show member management
      closeGroupModal();
      await loadData();
      openGroupModal(newTeam.id);
      return;
    }

    closeGroupModal();
    await loadData();
  } catch (err) {
    showToast('Failed to save team: ' + err.message, 'error');
  }
}

async function renderTeamMembers(teamId) {
  const container = document.getElementById('team-member-list');
  container.innerHTML = '<div class="loading-overlay" style="padding:12px"><div class="spinner"></div></div>';

  try {
    const members = await api(`/api/teams/${teamId}/members`);
    if (!members.length) {
      container.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">No members yet. Add members by email above.</div>';
      return;
    }
    container.innerHTML = members.map(m => `
      <div class="member-item">
        <div class="member-avatar">
          ${m.avatar_url ? `<img src="${m.avatar_url}">` : getInitials(m.name)}
        </div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.name)}</div>
          <div class="member-email">${escapeHtml(m.email)}</div>
        </div>
        <span class="member-role ${m.role}">${m.role}</span>
        <button class="member-remove" onclick="TF.removeMember(${teamId}, ${m.user_id})" title="Remove">✕</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div style="color:var(--red);font-size:13px;padding:8px;">Failed to load members</div>';
  }
}

async function addTeamMember() {
  if (!editingGroupId) return;
  const emailInput = document.getElementById('member-email-input');
  const email = emailInput.value.trim();
  if (!email) { showToast('Enter an email address', 'error'); return; }
  if (!email.includes('@')) { showToast('Enter a valid email', 'error'); return; }

  try {
    const result = await api(`/api/teams/${editingGroupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    emailInput.value = '';
    showToast(result.message || `${email} added ✓`, 'success');
    renderTeamMembers(editingGroupId);

    // Reload users for assignee dropdown
    allUsers = await api('/auth/users');
  } catch (err) {
    showToast('Failed to add: ' + err.message, 'error');
  }
}

async function removeMember(teamId, userId) {
  if (!confirm('Remove this member from the team?')) return;
  try {
    await api(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
    showToast('Member removed', 'info');
    renderTeamMembers(teamId);
  } catch (err) {
    showToast('Failed to remove: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════

function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="font-size:14px">${icons[type]}</span><span>${escapeHtml(msg)}</span>`;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = 'all 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeTaskModal(); closeGroupModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('search-input').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openTaskModal(); }
});

// Close modals on overlay click
document.getElementById('task-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('task-modal')) closeTaskModal();
});
document.getElementById('group-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('group-modal')) closeGroupModal();
});

// Enter key in member email input
document.getElementById('member-email-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addTeamMember(); }
});

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════

// Export all public functions for onclick handlers
window.TF = {
  demoLogin, logout, setFilter, setGroupFilter, setStatusFilter,
  setPriorityFilter, setView, openTaskModal, openEditModal,
  closeTaskModal, saveTask, deleteTask, toggleDone,
  openGroupModal, closeGroupModal, selectColor, saveGroup,
  addTeamMember, removeMember, renderTasks,
};

// Boot
(async function init() {
  // Try auto-login
  const loggedIn = await tryAutoLogin();
  if (loggedIn) {
    enterApp();
  } else {
    // Show auth screen, init Google
    initGoogleAuth();
  }
})();
