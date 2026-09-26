module.exports = {
  apps: [{
    name: 'insurance-api',
    cwd: __dirname,
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 5000,
    kill_timeout: 20000,
    env: { NODE_ENV: 'production' },
  }],
};
