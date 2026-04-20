const app    = require('./app');
const { env }= require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');
const { startCronJobs, stopCronJobs } = require('./modules/cron/cron.jobs');
const logger = require('./config/logger');

let server;

const startServer = async () => {
  // Connect to database first
  await connectDB();

  server = app.listen(env.PORT, () => {
    logger.info(`
╔══════════════════════════════════════════════════╗
║          MyBusiness API Server                   ║
╠══════════════════════════════════════════════════╣
║  Status:      Running                            ║
║  Port:        ${String(env.PORT).padEnd(34)}║
║  Environment: ${String(env.NODE_ENV).padEnd(34)}║
║  API Prefix:  ${String(env.API_PREFIX).padEnd(34)}║
╚══════════════════════════════════════════════════╝
    `);

    // Start cron jobs only in production or if explicitly enabled
    if (env.IS_PRODUCTION || process.env.ENABLE_CRON === 'true') {
      startCronJobs();
    }
  });

  // Increase default timeout for large exports
  server.timeout = 120000; // 2 minutes
};

// ── Graceful shutdown ─────────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.warn(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      stopCronJobs();
      await disconnectDB();
      logger.info('Graceful shutdown complete. Bye!');
      process.exit(0);
    });
  }

  // Force exit after 15 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

startServer();
