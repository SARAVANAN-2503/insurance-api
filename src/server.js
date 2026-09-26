const http = require('node:http');
const env = require('./config/env');
const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { stopImports } = require('./services/import-service');
const { startMessageScheduler, stopMessageScheduler } = require('./jobs/message-scheduler');
const { startCpuMonitor, stopCpuMonitor } = require('./monitoring/cpu-monitor');

const server = http.createServer(app);
let shuttingDown = false;
let startup;

async function start() {
  await connectDatabase(env.mongodbUri);

  if (shuttingDown) return;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  console.log(`Server listening on port ${env.port}`);
  if (!shuttingDown) {
    startMessageScheduler();
    if (env.cpuMonitorEnabled) {
      startCpuMonitor({
        thresholdPercent: env.cpuThresholdPercent,
        sampleIntervalMs: env.cpuSampleIntervalMs,
        startupGraceMs: env.cpuStartupGraceMs,
        onThreshold: () => shutdown('CPU threshold reached', 1),
      });
    }
  }
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopCpuMonitor();
  const importsStopped = stopImports();
  const schedulerStopped = stopMessageScheduler();
  let cleanupFailed = false;
  console.log(`Shutting down: ${reason}`);

  const timeout = setTimeout(() => {
    console.error('Shutdown timed out');
    process.exit(1);
  }, 15000);

  try {
    await startup.catch(() => {});

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

    await importsStopped;
    await schedulerStopped;
    process.exitCode = exitCode;
  } catch (err) {
    cleanupFailed = true;
    console.error('Shutdown failed:', err.name);
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch (err) {
      cleanupFailed = true;
      console.error('MongoDB shutdown failed:', err.name);
      process.exitCode = 1;
    } finally {
      if (!cleanupFailed) clearTimeout(timeout);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startup = start();
startup.catch((err) => {
  console.error('Server startup failed:', err.name);
  void shutdown('startup failure', 1);
});
