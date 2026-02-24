module.exports = {
  apps: [
    {
      name: 'deepterm',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 0.0.0.0',
      cwd: '/home/macan/deepterm',
      instances: 1, // Use 1 for Raspberry Pi to conserve resources
      exec_mode: 'fork', // Use 'cluster' on more powerful machines
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DEEPTERM_DOWNLOADS_DIR: '/var/www/deepterm-downloads',
        DEEPTERM_ISSUES_DIR: '/var/www/deepterm-issues',
      },
      
      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DEEPTERM_DOWNLOADS_DIR: '/var/www/deepterm-downloads',
        DEEPTERM_ISSUES_DIR: '/var/www/deepterm-issues',
      },
      
      // Development environment
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        DEEPTERM_DOWNLOADS_DIR: '/var/www/deepterm-downloads',
        DEEPTERM_ISSUES_DIR: '/var/www/deepterm-issues',
      },
      
      // Logging
      log_file: '/home/macan/deepterm/logs/combined.log',
      out_file: '/home/macan/deepterm/logs/out.log',
      error_file: '/home/macan/deepterm/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Process management
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      min_uptime: '10s', // Min uptime to consider app started
      max_restarts: 10, // Max restarts within min_uptime
      restart_delay: 4000, // Delay between restarts
      
      // Auto restart
      autorestart: true,
      watch: false, // Set to true for development
      ignore_watch: [
        'node_modules',
        'logs',
        '.git',
        '.next',
        'prisma/*.db',
        'prisma/*.db-journal',
      ],
      
      // Graceful shutdown
      kill_timeout: 5000, // Time to wait before forcing kill
      wait_ready: true, // Wait for process.send('ready')
      listen_timeout: 10000, // Time to wait for listen event
      
      // Cluster mode settings (for more powerful machines)
      // instances: 'max', // Use all CPU cores
      // exec_mode: 'cluster',
      
      // Source map support
      source_map_support: true,
      
      // Node.js arguments
      node_args: [
        '--max-old-space-size=512', // Limit heap size for Raspberry Pi
      ],
    },
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'macan',
      host: ['localhost'], // Change to your server IP
      ref: 'origin/main',
      repo: 'git@github.com:username/deepterm.git',
      path: '/home/macan/deepterm-deploy',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production',
      },
    },
    
    staging: {
      user: 'macan',
      host: ['localhost'],
      ref: 'origin/develop',
      repo: 'git@github.com:username/deepterm.git',
      path: '/home/macan/deepterm-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env development',
      env: {
        NODE_ENV: 'development',
      },
    },
  },
};
