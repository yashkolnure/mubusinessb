const { validationResult } = require('express-validator');
const { errorResponse, HTTP } = require('../utils/response.util');

/**
 * Run after express-validator chains.
 * Returns 422 with all validation errors if any exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, {
      status:  HTTP.UNPROCESSABLE,
      message: 'Validation failed.',
      errors:  errors.array().map(({ msg, path, value }) => ({ field: path, message: msg, value })),
    });
  }
  next();
};

module.exports = { validate };
