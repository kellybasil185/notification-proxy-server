// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path'); // Import path module

// Use an environment variable for the data directory, defaulting for local dev
const DATA_DIR = process.env.DATA_DIR || '.'; // On Render, DATA_DIR could be /data
const DB_PATH = path.join(DATA_DIR, 'notifications.sqlite');

console.log(`Database path: ${DB_PATH}`); // Log the path for debugging

const db = new sqlite3.Database(DB_PATH, (err) => {
  // ... rest of your db connection and table creation logic remains the same
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      content TEXT NOT NULL,
      received_at DATETIME DEFAULT (datetime('now','localtime'))
    )`, (err) => {
      if (err) {
        console.error('Error creating table', err.message);
      } else {
        console.log('Notifications table ready.');
      }
    });
  }
});

const addNotification = (source, content, callback) => {
  const sql = `INSERT INTO notifications (source, content) VALUES (?, ?)`;
  db.run(sql, [source, content], function(err) {
    if (callback) {
      callback(err, this ? this.lastID : null);
    }
  });
};

const getNotifications = (options = {}, callback) => {
  const limit = options.limit || 20;
  let sql = `SELECT id, source, content, received_at FROM notifications`;
  const params = [];

  if (options.since_id) {
    sql += ` WHERE id > ?`;
    params.push(options.since_id);
  }
  
  sql += ` ORDER BY received_at DESC LIMIT ?`;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (callback) {
      callback(err, rows);
    }
  });
};

// --- NEW FUNCTION TO DELETE NOTIFICATIONS BY SOURCE ---
const deleteNotificationsBySource = (sourceName, callback) => {
  const sql = `DELETE FROM notifications WHERE source = ?`;
  db.run(sql, [sourceName], function(err) { // Use function to access this.changes
    if (callback) {
      // this.changes contains the number of rows deleted
      callback(err, this ? this.changes : 0);
    }
  });
};

module.exports = {
  addNotification,
  getNotifications,
  deleteNotificationsBySource, // Export the new function
  db 
};
