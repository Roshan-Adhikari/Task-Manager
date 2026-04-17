const cron = require('node-cron');
const { queries } = require('../database/db');
const { sendReminderEmail } = require('./emailService');

function startReminderScheduler() {
  const intervalHours = parseInt(process.env.REMINDER_INTERVAL_HOURS) || 3;

  // Run every N hours
  const cronExpression = `0 */${intervalHours} * * *`;

  console.log(`⏰ Reminder scheduler started — runs every ${intervalHours} hours (cron: ${cronExpression})`);

  cron.schedule(cronExpression, () => runReminderCheck());

  // Run initial check after 30 seconds
  setTimeout(async () => {
    console.log('\n🔔 Running initial reminder check...');
    try {
      const overdueTasks = queries.getOverdueTasks();
      const pendingTasks = queries.getPendingTasks();
      const total = overdueTasks.length + pendingTasks.length;
      if (total > 0) {
        console.log(`   ⚠️  Found ${overdueTasks.length} overdue + ${pendingTasks.length} pending task(s) on startup`);
      } else {
        console.log('   ✅ No overdue tasks');
      }
    } catch (err) {
      console.error('   Initial check failed:', err.message);
    }
  }, 30000);
}

async function runReminderCheck() {
  console.log(`\n🔔 [${new Date().toISOString()}] Running reminder check...`);

  try {
    const overdueTasks = queries.getOverdueTasks();
    const pendingTasks = queries.getPendingTasks();

    // Combine and deduplicate
    const allTasks = [...overdueTasks];
    for (const pt of pendingTasks) {
      if (!allTasks.find(t => t.id === pt.id)) {
        allTasks.push(pt);
      }
    }

    if (allTasks.length === 0) {
      console.log('   ✅ No pending/overdue tasks to remind about');
      return;
    }

    // ── Build recipient map: email → { name, tasks[] } ──────────
    const tasksByEmail = {};

    function addTaskForEmail(email, name, task) {
      if (!email) return;
      email = email.toLowerCase().trim();
      if (!tasksByEmail[email]) {
        tasksByEmail[email] = { name: name || email.split('@')[0], tasks: [] };
      }
      // Avoid duplicates
      if (!tasksByEmail[email].tasks.find(t => t.id === task.id)) {
        tasksByEmail[email].tasks.push(task);
      }
    }

    for (const task of allTasks) {
      // 1. Send to the directly assigned person
      const assigneeEmail = task.assigned_email || task.assigned_to_email;
      if (assigneeEmail) {
        addTaskForEmail(assigneeEmail, task.assigned_to_name, task);
      }

      // 2. Send to ALL team members if the task belongs to a team
      if (task.team_id) {
        try {
          const members = queries.getTeamMembers(task.team_id);
          for (const member of members) {
            if (member.email) {
              addTaskForEmail(member.email, member.name, task);
            }
          }
        } catch (e) {
          console.error(`   ⚠️  Could not fetch team ${task.team_id} members:`, e.message);
        }
      }
    }

    // ── Send emails ──────────────────────────────────────────────
    let sentCount = 0;
    for (const [email, data] of Object.entries(tasksByEmail)) {
      try {
        await sendReminderEmail(email, data.name, data.tasks);
        sentCount++;

        // Mark overdue tasks as reminded (only task-level, not per-user)
        for (const task of data.tasks) {
          if (overdueTasks.find(t => t.id === task.id)) {
            queries.markReminderSent(task.id);
          }
        }
      } catch (err) {
        console.error(`   ❌ Failed to send reminder to ${email}:`, err.message);
      }
    }

    console.log(`   📧 Sent ${sentCount} reminder email(s) for ${allTasks.length} task(s)`);

  } catch (err) {
    console.error('   ❌ Reminder scheduler error:', err);
  }
}

module.exports = { startReminderScheduler };
