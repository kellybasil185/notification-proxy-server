// ecosystem.config.js
module.exports = {
  apps : [
    {
      name   : "notification-proxy-server",
      script : "./server.js", // Path to your Node.js server file
      watch  : false, // Or true if you want PM2 to restart on file changes (usually false for production)
      env    : {
        NODE_ENV: "production", // You can set other env vars here if needed, but Render's dashboard is better
      }
    },
    {
      name   : "telegram-listener",
      script : "./telegram_forwarder.py", 
      watch  : false,
      env    : {
        // Python specific env vars if needed
      }
    }
  ]
};