const rateLimit = require('express-rate-limit');
const { env }   = require('../config/env');

const createLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message:           { success: false, message },
    standardHeaders:   true,
    legacyHeaders:     false,
    skipSuccessfulRequests: false,
  });

// General API rate limit
const apiLimiter = createLimiter(
  env.RATE_LIMIT_WINDOW_MS,
  env.RATE_LIMIT_MAX,
  'Too many requests. Please try again later.'
);

// Strict limit for auth endpoints
const authLimiter = createLimiter(
  15 * 60 * 1000,             // 15 minutes
  env.AUTH_RATE_LIMIT_MAX,    // 10 attempts
  'Too many authentication attempts. Please wait 15 minutes.'
);

// Password reset – very strict
const passwordResetLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many password reset requests. Please wait 1 hour.'
);

// Export endpoint limiter
const exportLimiter = createLimiter(
  60 * 1000, // 1 minute
  10,
  'Too many export requests. Please slow down.'
);

module.exports = { apiLimiter, authLimiter, passwordResetLimiter, exportLimiter };
