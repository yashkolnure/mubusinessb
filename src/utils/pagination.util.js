/**
 * Extracts and validates pagination params from query string
 */
const getPagination = (query) => {
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Builds a date range filter for Prisma from query params
 * Expects: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getDateRange = (query, field = 'createdAt') => {
  const filter = {};
  if (query.startDate || query.endDate) {
    filter[field] = {};
    if (query.startDate) filter[field].gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      filter[field].lte = end;
    }
  }
  return filter;
};

/**
 * Builds a search filter across multiple string fields
 */
const buildSearchFilter = (searchTerm, fields) => {
  if (!searchTerm) return {};
  return {
    OR: fields.map((field) => ({
      [field]: { contains: searchTerm, mode: 'insensitive' },
    })),
  };
};

/**
 * Safely parses sort order from query string
 * ?sortBy=createdAt&sortOrder=desc
 */
const getSortOrder = (query, allowedFields, defaultField = 'createdAt') => {
  const field = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const order = query.sortOrder === 'asc' ? 'asc' : 'desc';
  return { [field]: order };
};

module.exports = { getPagination, getDateRange, buildSearchFilter, getSortOrder };
