const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { paginatedResponse } = require('../../utils/response.util');
const { getPagination, getDateRange, getSortOrder } = require('../../utils/pagination.util');

// GET /audit  – paginated audit log with rich filtering
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const dateFilter = getDateRange(req.query, 'createdAt');
  const orderBy    = getSortOrder(req.query, ['createdAt', 'module', 'action']);

  const where = {
    businessId: req.businessId,
    ...dateFilter,
    ...(req.query.module     && { module:    req.query.module }),
    ...(req.query.action     && { action:    req.query.action }),
    ...(req.query.userId     && { userId:    req.query.userId }),
    ...(req.query.entityType && { entityType:req.query.entityType }),
    ...(req.query.entityId   && { entityId:  req.query.entityId }),
    ...(req.query.search && {
      OR: [
        { description: { contains: req.query.search, mode: 'insensitive' } },
        { userEmail:   { contains: req.query.search, mode: 'insensitive' } },
      ],
    }),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where, skip, take: limit, orderBy,
      select: {
        id: true, module: true, action: true, entityType: true, entityId: true,
        description: true, userEmail: true, userRole: true, ipAddress: true,
        createdAt: true,
        // Exclude oldData/newData from list for performance; available in single record
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginatedResponse(res, { data: logs, page, limit, total });
});

// GET /audit/:id  – single log entry with full data diff
exports.getAuditLog = asyncHandler(async (req, res) => {
  const { successResponse, errorResponse, HTTP } = require('../../utils/response.util');

  const log = await prisma.auditLog.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
  });
  if (!log) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Audit log not found.' });
  return successResponse(res, { data: log });
});
