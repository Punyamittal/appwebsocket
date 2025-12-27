/**
 * PM2 Ecosystem Configuration
 * 
 * Run with: pm2 start ecosystem.config.js
 * 
 * Benefits:
 * - Auto-restart on crash
 * - Auto-restart on file changes (watch mode)
 * - Process management
 * - Logging
 * - Zero-downtime reloads
 */

module.exports = {
  apps: [{
    name: 'engage-server',
    script: './engage-server.js',
    instances: 1, // Single instance for now (can scale later)
    exec_mode: 'fork',
    watch: false, // Set to true for development auto-reload
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      ENGAGE_PORT: 3002,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379
    },
    env_production: {
      NODE_ENV: 'production',
      ENGAGE_PORT: 3002,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379
    },
    error_file: './logs/engage-error.log',
    out_file: './logs/engage-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
};

