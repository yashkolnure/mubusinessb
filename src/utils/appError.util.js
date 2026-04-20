// ============================================================
// CUSTOM APPLICATION ERROR
// ============================================================
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors     = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================
// ASYNC HANDLER – eliminates try/catch boilerplate
// ============================================================
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, asyncHandler };
