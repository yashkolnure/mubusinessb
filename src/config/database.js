const { PrismaClient } = require('@prisma/client');
const { env } = require('./env');

const prisma = new PrismaClient({
  log: env.IS_DEVELOPMENT
    ? [{ emit: 'event', level: 'query' }, 'info', 'warn', 'error']
    : ['warn', 'error'],
  errorFormat: 'minimal',
});

if (env.IS_DEVELOPMENT) {
  prisma.$on('query', (e) => {
    if (process.env.LOG_QUERIES === 'true') {
      console.log(`Query: ${e.query}`);
      console.log(`Duration: ${e.duration}ms`);
    }
  });
}

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  await prisma.$disconnect();
  console.log('🔌 Database disconnected');
};

module.exports = { prisma, connectDB, disconnectDB };
