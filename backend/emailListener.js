// emailListener.js
require('dotenv').config();
const MailListener = require("mail-listener2");
const { addNotification } = require('./database');

const TRADINGVIEW_SENDER = "noreply@tradingview.com";
const ALERT_SUBJECT_PREFIX = "Alert:";

let mailListenerInstance = null; // Variable to hold the current mailListener instance
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS_FAST = 3; // Try a few times quickly
const INITIAL_RECONNECT_DELAY = 5000;    // 5 seconds
const NORMAL_RECONNECT_DELAY = 30000;   // 30 seconds
const LONG_RECONNECT_DELAY = 300000;  // 5 minutes
let currentReconnectDelay = INITIAL_RECONNECT_DELAY;
let reconnectTimeoutId = null;
let isAttemptingConnection = false; // Tracks if a connect/reconnect process is active

function setupMailListenerEventHandlers(listener) {
  listener.on("server:connected", function () {
    console.log("Email listener: Successfully connected to IMAP server.");
    reconnectAttempts = 0;
    currentReconnectDelay = INITIAL_RECONNECT_DELAY;
    isAttemptingConnection = false;
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
  });

  listener.on("server:disconnected", function (err) {
    console.warn("Email listener: Disconnected from IMAP server.", err || "Event triggered (e.g., BYE).");
    // isAttemptingConnection might be true if an error also triggered a reconnect attempt
    // Only schedule a new one if we aren't already in the process of trying to reconnect.
    if (!isAttemptingConnection) {
        scheduleReconnect("disconnected_event");
    }
  });

  listener.on("error", function (err) {
    console.error("Email listener: Error event.", err);
    if (!isAttemptingConnection) {
        scheduleReconnect("error_event");
    }
  });

  listener.on("mail", function (mail, seqno, attributes) {
    console.log("Email processed by mail event (candidate):", mail.subject);
    const senderEmail = mail.from && mail.from[0] && mail.from[0].address;
    const subject = mail.subject;

    if (senderEmail && senderEmail.toLowerCase().includes(TRADINGVIEW_SENDER.toLowerCase()) &&
        subject && subject.startsWith(ALERT_SUBJECT_PREFIX)) {
      console.log("TradingView alert email confirmed by JS filter.");
      const notificationContent = subject.substring(ALERT_SUBJECT_PREFIX.length).trim();
      if (notificationContent) {
        // Assuming 'type' is handled or defaulted in addNotification
        addNotification('TradingView', notificationContent, (dbErr, id) => {
          if (dbErr) {
            console.error('Failed to save TradingView notification from email:', dbErr);
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

function createAndStartNewListener() {
  console.log("Email listener: Creating and starting new MailListener instance.");
  isAttemptingConnection = true; // We are now actively trying to connect

  mailListenerInstance = new MailListener({
    username: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "993"),
    tls: process.env.EMAIL_TLS === 'true',
    connTimeout: 20000, // Increased
    authTimeout: 10000, // Increased
    debug: console.log,
    tlsOptions: { rejectUnauthorized: false }, // Still be cautious with this
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

  setupMailListenerEventHandlers(mailListenerInstance);

  try {
    mailListenerInstance.start();
    // isAttemptingConnection will be set to false in "server:connected" handler
    // or if scheduleReconnect is called again due to immediate failure.
  } catch (e) {
    console.error("Email listener: Error calling start() on new instance.", e);
    isAttemptingConnection = false; // Reset flag if start itself fails synchronously
    scheduleReconnect("start_catch_error"); // Try scheduling again
  }
}

function scheduleReconnect(caller) {
  console.log(`Email listener: Reconnect triggered by: ${caller}`);
  if (isAttemptingConnection && reconnectTimeoutId) {
    console.log("Email listener: Reconnect attempt already scheduled or in progress.");
    return;
  }
  isAttemptingConnection = true; // Mark that we will attempt to reconnect

  reconnectAttempts++;

  if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS_FAST) {
    currentReconnectDelay = NORMAL_RECONNECT_DELAY;
  } else {
    console.warn(`Email listener: Consecutive failed reconnect attempts (${reconnectAttempts}). Using longer delay.`);
    currentReconnectDelay = LONG_RECONNECT_DELAY;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS_FAST + 5) { // After several long delays, reset for a bit
        console.warn("Email listener: Resetting reconnect attempt count after many long delays.")
        reconnectAttempts = 0; // Give it a fresh set of faster retries after many failures
    }
  }

  console.log(`Email listener: Scheduling reconnect attempt ${reconnectAttempts} in ${currentReconnectDelay / 1000}s.`);
  if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);

  reconnectTimeoutId = setTimeout(() => {
    // If there's an old instance, try to stop it. mail-listener2 doesn't have an explicit stop/destroy.
    // Setting to null and relying on GC is the typical pattern if no explicit cleanup is provided.
    if (mailListenerInstance) {
        console.log("Email listener: Clearing old instance before creating new one.");
        // mail-listener2 does not have a public .stop() or .end() method to gracefully close the IMAP connection from the client side.
        // The old connection object will eventually be garbage collected.
        // The main concern is ensuring new attempts use fresh objects.
        mailListenerInstance = null;
    }
    createAndStartNewListener();
  }, currentReconnectDelay);
}

function startEmailListener() {
  console.log("Email listener: Initializing and starting for the first time.");
  if (isAttemptingConnection) {
      console.log("Email listener: Start requested, but an attempt is already in progress.");
      return;
  }
  createAndStartNewListener();
}

module.exports = { startEmailListener };