// ============================================================
// STANDARDIZED API RESPONSE UTILITY
// ============================================================

/**
 * Success Response
 * @param {object} res - Express response
 * @param {object} options
 */
const successResponse = (res, { status = 200, message = 'Success', data = null, meta = null }) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  if (meta !== null) payload.meta = meta;
  return res.status(status).json(payload);
};

/**
 * Error Response
 */
const errorResponse = (res, { status = 500, message = 'Internal Server Error', errors = null }) => {
  const payload = { success: false, message };
  if (errors !== null) payload.errors = errors;
  return res.status(status).json(payload);
};

/**
 * Paginated Response
 */
const paginatedResponse = (res, { data, page, limit, total, message = 'Data retrieved successfully' }) => {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      total,
      page:       parseInt(page, 10),
      limit:      parseInt(limit, 10),
      totalPages: Math.ceil(total / limit),
      hasNext:    page * limit < total,
      hasPrev:    page > 1,
    },
  });
};

// HTTP status code constants for clean usage
const HTTP = {
  OK:         200,
  CREATED:    201,
  NO_CONTENT: 204,
  BAD_REQUEST:     400,
  UNAUTHORIZED:    401,
  FORBIDDEN:       403,
  NOT_FOUND:       404,
  CONFLICT:        409,
  UNPROCESSABLE:   422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR:    500,
};

module.exports = { successResponse, errorResponse, paginatedResponse, HTTP };
