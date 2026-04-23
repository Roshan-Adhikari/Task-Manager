const express = require('express');
const https = require('https');
const { queries } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C0AJ41DFP38';

function slackAPI(method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: 'slack.com',
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Failed to parse Slack response')); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// GET all slack users
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const users = await queries.getAllSlackUsers();
    res.json(users);
  } catch (err) {
    console.error('Slack users error:', err);
    res.status(500).json({ error: 'Failed to fetch Slack users' });
  }
});

// ADD slack user
router.post('/users', authMiddleware, async (req, res) => {
  try {
    const { name, email, slack_user_id } = req.body;
    if (!name || !email || !slack_user_id) {
      return res.status(400).json({ error: 'Name, email and Slack user ID are required' });
    }
    await queries.addSlackUser(name, email, slack_user_id);
    const users = await queries.getAllSlackUsers();
    res.status(201).json(users);
  } catch (err) {
    console.error('Add Slack user error:', err);
    res.status(500).json({ error: 'Failed to add Slack user' });
  }
});

// DELETE slack user
router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    await queries.deleteSlackUser(parseInt(req.params.id));
    res.json({ message: 'Slack user removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove Slack user' });
  }
});

// SEND message to individual user(s) via DM
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { user_ids, message } = req.body;
    if (!user_ids || !user_ids.length || !message) {
      return res.status(400).json({ error: 'User IDs and message are required' });
    }

    if (!SLACK_BOT_TOKEN) {
      return res.status(400).json({ error: 'SLACK_BOT_TOKEN not configured' });
    }

    const results = [];
    for (const userId of user_ids) {
      try {
        // Step 1: Open a DM conversation with the user
        const openResult = await slackAPI('conversations.open', { users: userId });
        console.log(`Slack conversations.open for ${userId}:`, JSON.stringify(openResult));

        if (!openResult.ok) {
          results.push({ userId, ok: false, error: openResult.error || 'Failed to open DM' });
          continue;
        }

        const dmChannelId = openResult.channel.id;

        // Step 2: Send message to the DM channel
        const sendResult = await slackAPI('chat.postMessage', {
          channel: dmChannelId,
          text: message,
          mrkdwn: true,
        });
        console.log(`Slack chat.postMessage to ${userId} (${dmChannelId}):`, JSON.stringify(sendResult));

        results.push({ userId, ok: sendResult.ok, error: sendResult.error });
      } catch (innerErr) {
        console.error(`Slack error for user ${userId}:`, innerErr);
        results.push({ userId, ok: false, error: innerErr.message });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);

    if (succeeded === 0 && failed.length > 0) {
      return res.status(400).json({
        error: `All messages failed: ${failed.map(f => f.error).join(', ')}`,
        results
      });
    }

    res.json({
      message: `Sent to ${succeeded} user(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
      succeeded,
      failed: failed.map(f => ({ userId: f.userId, error: f.error })),
      results
    });
  } catch (err) {
    console.error('Slack send error:', err);
    res.status(500).json({ error: 'Failed to send Slack message: ' + err.message });
  }
});

// SEND message to channel (bulk)
router.post('/send-channel', authMiddleware, async (req, res) => {
  try {
    const { message, channel_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await slackAPI('chat.postMessage', {
      channel: channel_id || SLACK_CHANNEL_ID,
      text: message,
      mrkdwn: true,
    });

    if (result.ok) {
      res.json({ message: 'Message sent to channel ✓' });
    } else {
      res.status(400).json({ error: result.error || 'Failed to send to channel' });
    }
  } catch (err) {
    console.error('Slack channel send error:', err);
    res.status(500).json({ error: 'Failed to send message to channel' });
  }
});

module.exports = router;
