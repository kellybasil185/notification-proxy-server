// emailListener.js
require('dotenv').config();
const MailListener = require("mail-listener2");
const { addNotification } = require('./database');

const TRADINGVIEW_SENDER = "noreply@tradingview.com";
const ALERT_SUBJECT_PREFIX = "Alert:";

// --- Reconnection Strategy Variables ---
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10; // Max attempts before a longer pause
const INITIAL_RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_DELAY = 60000; // 1 minute
let currentReconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimeoutId = null;
let isReconnecting = false; // Flag to prevent multiple concurrent reconnect attempts
// --- End Reconnection Strategy Variables ---


const mailListener = new MailListener({
  username: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "993"),
  tls: process.env.EMAIL_TLS === 'true',
  connTimeout: 15000, // Slightly increased connection timeout
  authTimeout: 7000,  // Slightly increased auth timeout
  debug: console.log,
  tlsOptions: { rejectUnauthorized: false }, // Be cautious with this in production for public email providers
  mailbox: "INBOX",
  searchFilter: [
    "UNSEEN",
    ["FROM", TRADINGVIEW_SENDER],
    ["SUBJECT", ALERT_SUBJECT_PREFIX]
  ],
  markSeen: true,
  fetchUnreadOnStart: true,
  mailParserOptions: { streamAttachments: false },
  attachments: false,
});

function attemptReconnect() {
  if (isReconnecting) {
    console.log("Email listener: Reconnection already in progress.");
    return;
  }
  isReconnecting = true;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`Email listener: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Will try again after a longer delay or manual restart.`);
    // Optionally, you could set a much longer timeout here, or stop trying until a manual restart.
    // For now, let's reset attempts and use max delay to keep trying indefinitely but less frequently.
    currentReconnectDelay = MAX_RECONNECT_DELAY; // Keep trying at max delay
  } else {
    reconnectAttempts++;
    // Exponential backoff for delay
    currentReconnectDelay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts -1), MAX_RECONNECT_DELAY);
  }

  console.log(`Email listener: Attempting to reconnect in ${currentReconnectDelay / 1000}s (Attempt ${reconnectAttempts})`);

  if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId); // Clear any existing timeout

  reconnectTimeoutId = setTimeout(() => {
    console.log("Email listener: Executing reconnect attempt...");
    try {
      // It's important to ensure that mailListener itself is in a state where start() can be called.
      // If mailListener internally manages its state correctly, this should be okay.
      // Some libraries might require creating a new instance if the old one is permanently closed.
      // For mail-listener2, start() should attempt to re-establish.
      mailListener.start();
    } catch (e) {
      console.error("Email listener: Error during reconnect attempt:", e);
      // The 'error' event on mailListener should also catch this, but good to log here too.
    } finally {
      isReconnecting = false; // Allow new attempts after this one
    }
  }, currentReconnectDelay);
}

function startEmailListener() {
  mailListener.start();

  mailListener.on("server:connected", function(){
    console.log("Email listener connected to IMAP server.");
    reconnectAttempts = 0; // Reset attempts on successful connection
    currentReconnectDelay = INITIAL_RECONNECT_DELAY; // Reset delay
    isReconnecting = false;
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
  });

  mailListener.on("server:disconnected", function(err){ // err object might be passed by the library
    console.warn("Email listener disconnected from IMAP server.", err || "* BYE or other reason");
    isReconnecting = false; // Allow a new reconnect attempt to be scheduled
    attemptReconnect();
  });

  mailListener.on("error", function(err){
    console.error("Email listener error:", err);
    // You might want to trigger a reconnect attempt here too,
    // depending on whether "server:disconnected" always follows an error that causes disconnection.
    // Avoid calling attemptReconnect() if isReconnecting is true to prevent loops on some errors.
    if (!isReconnecting && (err.code === 'ECONNRESET' || err.message.includes('ETIMEDOUT') || err.message.includes('ENOTFOUND'))) {
       console.log("Email listener: Attempting reconnect due to connection error.");
       isReconnecting = false; // Reset before calling attemptReconnect if it's a new disconnection sequence
       attemptReconnect();
    }
  });

  mailListener.on("mail", function(mail, seqno, attributes){
    console.log("Email processed by mail event (candidate):", mail.subject);
    const senderEmail = mail.from && mail.from[0] && mail.from[0].address;
    const subject = mail.subject;

    if (senderEmail && senderEmail.toLowerCase().includes(TRADINGVIEW_SENDER.toLowerCase()) &&
        subject && subject.startsWith(ALERT_SUBJECT_PREFIX)) {
      console.log("TradingView alert email confirmed by JS filter.");
      const notificationContent = subject.substring(ALERT_SUBJECT_PREFIX.length).trim();
      if (notificationContent) {
        addNotification('TradingView', notificationContent, (err, id) => { // Assuming type is handled or defaulted in addNotification
          if (err) {
            console.error('Failed to save TradingView notification from email:', err);
          } else {
            console.log('TradingView notification from email saved with ID:', id);
          }
        });
      } else {
        console.warn("Could not extract content from TradingView alert email subject:", subject);
      }
    }
  });
}

module.exports = { startEmailListener };