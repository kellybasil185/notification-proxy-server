// emailListener.js
require('dotenv').config();
const MailListener = require("mail-listener2");
const { addNotification } = require('./database');

const TRADINGVIEW_SENDER = "noreply@tradingview.com";
const ALERT_SUBJECT_PREFIX = "Alert:"; // This will now also be used in the server-side search

const mailListener = new MailListener({
  username: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "993"),
  tls: process.env.EMAIL_TLS === 'true',
  connTimeout: 10000,
  authTimeout: 5000,
  debug: console.log, // Keep this for debugging the new search filter
  tlsOptions: { rejectUnauthorized: false },
  mailbox: "INBOX",
  // --- MODIFIED searchFilter ---
  searchFilter: [
    "UNSEEN",                         // Still only look for unread emails
    ["FROM", TRADINGVIEW_SENDER],     // Only emails FROM TradingView
    ["SUBJECT", ALERT_SUBJECT_PREFIX] // Only emails where the subject CONTAINS "Alert:"
                                      // Note: IMAP SUBJECT search is typically a substring search.
                                      // Your JS filter `subject.startsWith(ALERT_SUBJECT_PREFIX)`
                                      // will provide the exact "starts with" check.
  ],
  // --- End of MODIFIED searchFilter ---
  markSeen: true,
  fetchUnreadOnStart: true,
  mailParserOptions: { streamAttachments: false },
  attachments: false,
});

// The rest of your emailListener.js (startEmailListener function, event handlers)
// can remain largely the same. Your JavaScript filtering inside the mailListener.on("mail", ...)
// event is still a good final check.

function startEmailListener() {
  mailListener.start();

  mailListener.on("server:connected", function(){
    console.log("Email listener connected to IMAP server (with updated filter).");
  });

  mailListener.on("server:disconnected", function(){
    console.log("Email listener disconnected from IMAP server. Attempting to reconnect...");
    // Consider a more robust reconnect strategy if needed
    // setTimeout(() => { try { mailListener.start(); } catch(e){ console.error(e); } }, 30000);
  });

  mailListener.on("error", function(err){
    console.error("Email listener error:", err);
  });

  mailListener.on("mail", function(mail, seqno, attributes){
    // This 'mail' event should now only fire for emails that (mostly) match the new server-side filter
    console.log("Email processed by mail event (candidate):", mail.subject);

    const senderEmail = mail.from && mail.from[0] && mail.from[0].address;
    const subject = mail.subject;

    // This JavaScript filter is still a good final validation
    if (senderEmail && senderEmail.toLowerCase().includes(TRADINGVIEW_SENDER.toLowerCase()) && 
        subject && subject.startsWith(ALERT_SUBJECT_PREFIX)) {
      console.log("TradingView alert email confirmed by JS filter.");
      
      const notificationContent = subject.substring(ALERT_SUBJECT_PREFIX.length).trim();

      if (notificationContent) {
        console.log("Extracted TradingView alert content:", notificationContent);
        addNotification('TradingView', notificationContent, (err, id) => {
          if (err) {
            console.error('Failed to save TradingView notification from email:', err);
          } else {
            console.log('TradingView notification from email saved with ID:', id);
          }
        });
      } else {
        console.warn("Could not extract content from TradingView alert email subject:", subject);
      }
    } else {
      // This block should be hit less frequently now
      // console.log("Email (after server filter) did not pass final JS filter. Subject:", subject, "From:", senderEmail);
    }
  });
}

module.exports = { startEmailListener };