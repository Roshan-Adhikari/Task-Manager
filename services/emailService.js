const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });

  return transporter;
}

// ── SEND TASK REMINDER EMAIL ───────────────────────────────────────
async function sendReminderEmail(email, userName, tasks) {
  const t = getTransporter();

  const taskRows = tasks.map(task => {
    const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date';
    const priorityColors = { high: '#f03e3e', medium: '#f59f00', low: '#3ecf8e' };
    const priorityColor = priorityColors[task.priority] || '#9aa0ab';
    const statusLabel = task.status === 'inprogress' ? 'In Progress' : task.status === 'todo' ? 'To Do' : task.status;

    return `
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #2a2d35; color:#e8eaed; font-size:14px;">${task.title}</td>
        <td style="padding:12px 16px; border-bottom:1px solid #2a2d35;">
          <span style="background:${priorityColor}22; color:${priorityColor}; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:500;">${task.priority}</span>
        </td>
        <td style="padding:12px 16px; border-bottom:1px solid #2a2d35; color:#f59f00; font-size:13px;">${statusLabel}</td>
        <td style="padding:12px 16px; border-bottom:1px solid #2a2d35; color:#f03e3e; font-size:13px;">${dueDate}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; background:#0d0f12; font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:600px; margin:0 auto; padding:32px 20px;">
        
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #1e2128 0%, #23272e 100%); border:1px solid rgba(255,255,255,0.07); border-radius:16px 16px 0 0; padding:32px; text-align:center;">
          <div style="width:48px; height:48px; background:rgba(124,106,247,0.12); border:1px solid rgba(124,106,247,0.35); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:16px;">📋</div>
          <h1 style="color:#e8eaed; font-size:22px; font-weight:600; margin:0 0 6px; letter-spacing:-0.5px;">Task Manager Reminder</h1>
          <p style="color:#9aa0ab; font-size:14px; margin:0;">You have ${tasks.length} pending task${tasks.length > 1 ? 's' : ''} that need${tasks.length === 1 ? 's' : ''} attention</p>
        </div>

        <!-- Body -->
        <div style="background:#1e2128; border:1px solid rgba(255,255,255,0.07); border-top:none; padding:24px;">
          <p style="color:#e8eaed; font-size:15px; margin:0 0 20px;">Hi <strong>${userName || 'Team Member'}</strong>,</p>
          <p style="color:#9aa0ab; font-size:14px; margin:0 0 24px; line-height:1.6;">The following tasks are overdue or due soon. Please update their status at your earliest convenience.</p>
          
          <table style="width:100%; border-collapse:collapse; background:#141619; border-radius:10px; overflow:hidden;">
            <thead>
              <tr style="background:#23272e;">
                <th style="padding:10px 16px; text-align:left; color:#9aa0ab; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Task</th>
                <th style="padding:10px 16px; text-align:left; color:#9aa0ab; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Priority</th>
                <th style="padding:10px 16px; text-align:left; color:#9aa0ab; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Status</th>
                <th style="padding:10px 16px; text-align:left; color:#9aa0ab; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Due</th>
              </tr>
            </thead>
            <tbody>
              ${taskRows}
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div style="background:#141619; border:1px solid rgba(255,255,255,0.07); border-top:none; border-radius:0 0 16px 16px; padding:24px; text-align:center;">
          <a href="http://localhost:3000" style="display:inline-block; background:#7c6af7; color:#fff; padding:10px 28px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:500;">Open TaskFlow</a>
          <p style="color:#5c6370; font-size:12px; margin:16px 0 0;">This is an automated reminder from TaskFlow. Reminders are sent every ${process.env.REMINDER_INTERVAL_HOURS || 3} hours for pending tasks.</p>
        </div>

      </div>
    </body>
    </html>
  `;

  await t.sendMail({
    from: `"${process.env.EMAIL_SENDER_NAME || 'Task Manager Reminder'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `⚡ TaskFlow: ${tasks.length} pending task${tasks.length > 1 ? 's' : ''} need your attention`,
    html,
  });

  console.log(`📧 Reminder sent to ${email} (${tasks.length} tasks)`);
}

// ── SEND TEAM INVITE EMAIL ─────────────────────────────────────────
async function sendInviteEmail(email, teamName, inviterName) {
  const t = getTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; background:#0d0f12; font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:500px; margin:0 auto; padding:32px 20px;">
        <div style="background:#1e2128; border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:40px 32px; text-align:center;">
          <div style="width:48px; height:48px; background:rgba(124,106,247,0.12); border:1px solid rgba(124,106,247,0.35); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:20px;">👥</div>
          <h1 style="color:#e8eaed; font-size:20px; font-weight:600; margin:0 0 12px;">You've been invited!</h1>
          <p style="color:#9aa0ab; font-size:14px; line-height:1.6; margin:0 0 24px;">
            <strong style="color:#e8eaed;">${inviterName}</strong> has added you to the team 
            <strong style="color:#7c6af7;">${teamName}</strong> on TaskFlow.
          </p>
          <a href="http://localhost:3000" style="display:inline-block; background:#7c6af7; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:500;">Sign in to TaskFlow</a>
          <p style="color:#5c6370; font-size:12px; margin:20px 0 0;">Sign in with your Google account (${email}) to get started.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await t.sendMail({
    from: `"${process.env.EMAIL_SENDER_NAME || 'Task Manager Reminder'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎉 You've been added to team "${teamName}" on TaskFlow`,
    html,
  });

  console.log(`📧 Invite sent to ${email} for team "${teamName}"`);
}

// ── SEND NOTIFICATION EMAIL ────────────────────────────────────────
async function sendNotificationEmail(email, subject, message) {
  const t = getTransporter();

  await t.sendMail({
    from: `"${process.env.EMAIL_SENDER_NAME || 'Task Manager Reminder'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    html: `
      <div style="max-width:500px; margin:0 auto; padding:32px 20px; background:#0d0f12; font-family:'Segoe UI',Arial,sans-serif;">
        <div style="background:#1e2128; border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:32px; text-align:center;">
          <h2 style="color:#e8eaed; margin:0 0 12px;">${subject}</h2>
          <p style="color:#9aa0ab; font-size:14px; line-height:1.6;">${message}</p>
          <a href="http://localhost:3000" style="display:inline-block; margin-top:20px; background:#7c6af7; color:#fff; padding:10px 24px; border-radius:8px; text-decoration:none; font-size:14px;">Open TaskFlow</a>
        </div>
      </div>
    `,
  });
}

// ── SEND TASK ASSIGNMENT EMAIL ─────────────────────────────────────
async function sendAssignmentEmail(email, userName, task) {
  const t = getTransporter();
  const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No due date';
  const priorityColors = { high: '#f03e3e', medium: '#f59f00', low: '#3ecf8e' };
  const priorityColor = priorityColors[task.priority] || '#9aa0ab';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; background:#0d0f12; font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:600px; margin:0 auto; padding:32px 20px;">
        <div style="background:linear-gradient(135deg, #1e2128 0%, #23272e 100%); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:32px; text-align:center;">
          <div style="width:48px; height:48px; background:rgba(124,106,247,0.12); border:1px solid rgba(124,106,247,0.35); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:16px;">🎯</div>
          <h1 style="color:#e8eaed; font-size:20px; font-weight:600; margin:0 0 8px;">New Task Assigned</h1>
          <p style="color:#9aa0ab; font-size:14px; margin:0 0 24px;">Hi <strong>${userName || 'Team Member'}</strong>, a new task has been assigned to you.</p>
          
          <div style="background:#141619; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:24px; text-align:left; margin-bottom:24px;">
            <div style="color:#e8eaed; font-size:18px; font-weight:600; margin-bottom:8px;">${task.title}</div>
            <div style="color:#9aa0ab; font-size:14px; margin-bottom:16px; line-height:1.5;">${task.description || 'No description provided.'}</div>
            
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
              <div style="margin-right:20px;">
                <div style="color:#5c6370; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Priority</div>
                <span style="background:${priorityColor}22; color:${priorityColor}; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:500;">${task.priority}</span>
              </div>
              <div>
                <div style="color:#5c6370; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Due Date</div>
                <div style="color:#f03e3e; font-size:13px; font-weight:500;">📅 ${dueDate}</div>
              </div>
            </div>
          </div>

          <a href="https://task-manager-9mif.onrender.com" style="display:inline-block; background:#7c6af7; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:500;">View in TaskFlow</a>
        </div>
      </div>
    </body>
    </html>
  `;

  await t.sendMail({
    from: `"${process.env.EMAIL_SENDER_NAME || 'Task Manager Reminder'}" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `🎯 New Task: ${task.title}`,
    html,
  });

  console.log(`📧 Assignment notification sent to ${email} for task: ${task.title}`);
}
// ── SEND MEETING CALENDAR INVITE (ICS) ────────────────────────────
async function sendMeetingInvite(meeting, organizerEmail, organizerName) {
  const t = getTransporter();

  // Parse attendee emails
  const attendeeEmails = meeting.attendees
    ? meeting.attendees.split(',').map(e => e.trim()).filter(Boolean)
    : [];

  // All recipients = attendees + organizer
  const allRecipients = [...new Set([...attendeeEmails, organizerEmail])];
  if (!allRecipients.length) return;

  // Build ICS date strings with timezone (YYYYMMDDTHHMMSS)
  const dateStr = (meeting.meeting_date || '').replace(/-/g, '');
  const startTime = (meeting.start_time || '10:00').replace(/:/g, '') + '00';
  const endTime = (meeting.end_time || '11:00').replace(/:/g, '') + '00';
  const dtStart = `${dateStr}T${startTime}`;
  const dtEnd = `${dateStr}T${endTime}`;
  const uid = `taskflow-meeting-${meeting.id || Date.now()}@taskflow.app`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Build ATTENDEE lines
  const attendeeLines = allRecipients.map(email =>
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${email}:mailto:${email}`
  ).join('\r\n');

  // ICS content with VTIMEZONE for proper calendar support
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TaskFlow//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'X-WR-TIMEZONE:Asia/Kolkata',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Asia/Kolkata:${dtStart}`,
    `DTEND;TZID=Asia/Kolkata:${dtEnd}`,
    `DTSTAMP:${now}`,
    `UID:${uid}`,
    `ORGANIZER;CN=${organizerName || organizerEmail}:mailto:${organizerEmail}`,
    attendeeLines,
    `SUMMARY:${(meeting.title || 'Meeting').replace(/[,;\\]/g, ' ')}`,
    `DESCRIPTION:${(meeting.description || '').replace(/\n/g, '\\n').replace(/[,;\\]/g, ' ')}${meeting.meet_link ? '\\n\\nJoin Google Meet: ' + meeting.meet_link : ''}`,
    meeting.meet_link ? `LOCATION:${meeting.meet_link}` : 'LOCATION:Online',
    `STATUS:CONFIRMED`,
    `SEQUENCE:0`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Meeting in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  // Beautiful HTML email body
  const meetDate = new Date(meeting.meeting_date + 'T00:00:00').toLocaleDateString('en', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="margin:0; padding:0; background:#0d0f12; font-family:'Segoe UI',Arial,sans-serif;">
      <div style="max-width:600px; margin:0 auto; padding:32px 20px;">
        <div style="background:linear-gradient(135deg, #1e2128 0%, #23272e 100%); border:1px solid rgba(255,255,255,0.07); border-radius:16px; padding:32px; text-align:center;">
          <div style="width:48px; height:48px; background:rgba(62,207,142,0.12); border:1px solid rgba(62,207,142,0.35); border-radius:12px; display:inline-flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:16px;">📅</div>
          <h1 style="color:#e8eaed; font-size:20px; font-weight:600; margin:0 0 8px;">Meeting Invitation</h1>
          <p style="color:#9aa0ab; font-size:14px; margin:0 0 24px;">${organizerName || 'A team member'} has invited you to a meeting</p>

          <div style="background:#141619; border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:24px; text-align:left; margin-bottom:24px;">
            <div style="color:#e8eaed; font-size:18px; font-weight:600; margin-bottom:12px;">${meeting.title || 'Meeting'}</div>
            ${meeting.description ? `<div style="color:#9aa0ab; font-size:14px; margin-bottom:16px; line-height:1.5;">${meeting.description}</div>` : ''}
            
            <div style="display:flex; flex-wrap:wrap; gap:20px;">
              <div>
                <div style="color:#5c6370; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Date</div>
                <div style="color:#e8eaed; font-size:14px; font-weight:500;">📅 ${meetDate}</div>
              </div>
              <div>
                <div style="color:#5c6370; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Time</div>
                <div style="color:#e8eaed; font-size:14px; font-weight:500;">🕐 ${meeting.start_time || '10:00'}${meeting.end_time ? ' – ' + meeting.end_time : ''}</div>
              </div>
              <div>
                <div style="color:#5c6370; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Attendees</div>
                <div style="color:#e8eaed; font-size:14px;">👥 ${allRecipients.length} invited</div>
              </div>
            </div>
          </div>

          ${meeting.meet_link ? `<a href="${meeting.meet_link}" style="display:inline-block; background:#3ecf8e; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:500; margin-bottom:12px;">🔗 Join Google Meet</a><br>` : ''}
          <a href="https://task-manager-9mif.onrender.com" style="display:inline-block; background:#7c6af7; color:#fff; padding:10px 24px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:500; margin-top:8px;">Open TaskFlow</a>
          
          <p style="color:#5c6370; font-size:12px; margin:20px 0 0;">This invite includes a calendar attachment. Open it to add the event to your calendar.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Send to all recipients with ICS as both alternative and attachment
  for (const recipient of allRecipients) {
    try {
      await t.sendMail({
        from: `"${process.env.EMAIL_SENDER_NAME || 'TaskFlow'}" <${process.env.EMAIL_USER}>`,
        to: recipient,
        subject: `📅 Meeting: ${meeting.title || 'Meeting'} — ${meetDate}`,
        html,
        alternatives: [
          {
            contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
            content: icsContent,
          }
        ],
        attachments: [
          {
            filename: 'invite.ics',
            content: icsContent,
            contentType: 'application/ics',
          }
        ],
      });
      console.log(`📅 Calendar invite sent to ${recipient} for "${meeting.title}"`);
    } catch (err) {
      console.error(`❌ Failed to send invite to ${recipient}:`, err.message);
    }
  }
}

module.exports = { sendReminderEmail, sendInviteEmail, sendNotificationEmail, sendAssignmentEmail, sendMeetingInvite };
