// server.js
const express = require('express');
const cors = require('cors');
// Update the destructuring to include the new delete function
const { addNotification, getNotifications, deleteNotificationsBySource } = require('./database');
const { startEmailListener } = require('./emailListener');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Webhook Endpoints ---
app.post('/webhook/tradingview', (req, res) => {
  console.log('Received TradingView Webhook:', req.body);
  const notificationContent = typeof req.body === 'string' ? req.body : JSON.stringify(req.body.message || req.body);
  if (!notificationContent) {
    return res.status(400).send('Bad Request: Notification content is missing.');
  }
  // Changed source to 'TradingView_Webhook' to distinguish from email if needed
  addNotification('TradingView_Webhook', notificationContent, (err, id) => {
    if (err) {
      console.error('Failed to save TradingView direct webhook notification:', err);
      return res.status(500).send('Error saving notification');
    }
    console.log('TradingView direct webhook notification saved with ID:', id);
    res.status(200).send('TradingView direct webhook received');
  });
});

app.post('/webhook/telegram', (req, res) => {
  console.log('Received Telegram Webhook:', req.body);
  const notificationContent = req.body.text || JSON.stringify(req.body);
  if (!notificationContent) {
    return res.status(400).send('Bad Request: Notification content is missing.');
  }
  addNotification('Telegram', notificationContent, (err, id) => {
    if (err) {
      console.error('Failed to save Telegram notification:', err);
      return res.status(500).send('Error saving notification');
    }
    console.log('Telegram notification saved with ID:', id);
    res.status(200).send('Telegram notification received');
  });
});

// --- API Endpoints for Dashboard ---
app.get('/api/notifications', (req, res) => {
  const options = {
    limit: parseInt(req.query.limit) || 20,
    since_id: req.query.since_id ? parseInt(req.query.since_id) : null
  };
  console.log(`Fetching notifications with options:`, options);
  getNotifications(options, (err, notifications) => {
    if (err) {
      console.error('Failed to retrieve notifications:', err);
      return res.status(500).send('Error retrieving notifications');
    }
    res.status(200).json(notifications || []);
  });
});

// --- NEW DELETE ENDPOINT ---
app.delete('/api/notifications/source/:sourceName', (req, res) => {
  const sourceName = req.params.sourceName;
  if (!sourceName) {
    return res.status(400).json({ error: 'Bad Request: Source name parameter is missing.' });
  }

  // Basic validation for allowed source names, can be expanded
  const allowedSources = ['Telegram', 'TradingView', 'TradingView_Webhook'];
  if (!allowedSources.includes(sourceName)) {
    return res.status(400).json({ error: `Bad Request: Source '${sourceName}' is not a valid source to delete.` });
  }

  console.log(`Attempting to delete notifications for source: ${sourceName}`);
  deleteNotificationsBySource(sourceName, (err, changes) => {
    if (err) {
      console.error(`Failed to delete notifications for source ${sourceName}:`, err);
      return res.status(500).json({ error: `Error deleting notifications for source ${sourceName}` });
    }
    console.log(`Successfully deleted ${changes} notifications for source: ${sourceName}`);
    res.status(200).json({ message: `Successfully deleted ${changes} notifications for source ${sourceName}.` });
  });
});
// --- END OF NEW DELETE ENDPOINT ---

app.get('/', (req, res) => {
  res.send('Notification Proxy Server is running.');
});

app.listen(PORT, () => {
  console.log(`Notification Proxy Server listening on port ${PORT}`);
  try {
    startEmailListener();
  } catch (error) {
    console.error("Failed to start email listener:", error)
  }
});
