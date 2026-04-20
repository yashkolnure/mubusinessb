const required = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
];

const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

module.exports = {
  validateEnv,
  env: {
    NODE_ENV:              process.env.NODE_ENV || 'development',
    PORT:                  parseInt(process.env.PORT, 10) || 5000,
    API_PREFIX:            process.env.API_PREFIX || '/api/v1',
    DATABASE_URL:          process.env.DATABASE_URL,
    JWT_ACCESS_SECRET:     process.env.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET:    process.env.JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    JWT_REFRESH_EXPIRES_IN:process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    REDIS_URL:             process.env.REDIS_URL || 'redis://localhost:6379',
    REDIS_PASSWORD:        process.env.REDIS_PASSWORD || '',
    EMAIL_HOST:            process.env.EMAIL_HOST || 'smtp.gmail.com',
    EMAIL_PORT:            parseInt(process.env.EMAIL_PORT, 10) || 587,
    EMAIL_SECURE:          process.env.EMAIL_SECURE === 'true',
    EMAIL_USER:            process.env.EMAIL_USER,
    EMAIL_PASS:            process.env.EMAIL_PASS,
    EMAIL_FROM_NAME:       process.env.EMAIL_FROM_NAME || 'MyBusiness',
    EMAIL_FROM_ADDRESS:    process.env.EMAIL_FROM_ADDRESS,
    UPLOAD_DIR:            process.env.UPLOAD_DIR || 'uploads',
    MAX_FILE_SIZE:         parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880,
    FRONTEND_URL:          process.env.FRONTEND_URL || 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS:  parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    RATE_LIMIT_MAX:        parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    AUTH_RATE_LIMIT_MAX:   parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
    BCRYPT_SALT_ROUNDS:    parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
    LOG_LEVEL:             process.env.LOG_LEVEL || 'debug',
    LOG_DIR:               process.env.LOG_DIR || 'logs',
    IS_PRODUCTION:         process.env.NODE_ENV === 'production',
    IS_DEVELOPMENT:        process.env.NODE_ENV === 'development',
  },
};
