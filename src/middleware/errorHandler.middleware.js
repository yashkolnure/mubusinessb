const { Prisma }   = require('@prisma/client');
const logger       = require('../config/logger');
const { env }      = require('../config/env');

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
const errorHandler = (err, req, res, next) => {
  let status  = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors  = err.errors || null;

  // ── Prisma errors ───────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        status  = 409;
        message = `A record with this ${err.meta?.target?.join(', ')} already exists.`;
        break;
      case 'P2025':
        status  = 404;
        message = 'Record not found.';
        break;
      case 'P2003':
        status  = 400;
        message = 'Related record not found. Check foreign key values.';
        break;
      case 'P2014':
        status  = 400;
        message = 'This operation would violate a relation constraint.';
        break;
      default:
        status  = 500;
        message = 'Database operation failed.';
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    status  = 400;
    message = 'Invalid data provided to the database.';
  }

  // ── JWT errors ──────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    status  = 401;
    message = 'Invalid token.';
  }
  if (err.name === 'TokenExpiredError') {
    status  = 401;
    message = 'Token expired.';
  }

  // ── Multer errors ───────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    status  = 400;
    message = 'File size exceeds the allowed limit.';
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status  = 400;
    message = 'Unexpected file field.';
  }

  // ── Log server errors ───────────────────────────────────────
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} – ${message}`, {
      stack:  err.stack,
      body:   req.body,
      params: req.params,
      userId: req.user?.id,
    });
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(env.IS_DEVELOPMENT && { stack: err.stack }),
  });
};

// ============================================================
// 404 HANDLER
// ============================================================
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
};

module.exports = { errorHandler, notFoundHandler };
