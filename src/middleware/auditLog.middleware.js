const { prisma }   = require('../config/database');
const logger       = require('../config/logger');

/**
 * Creates an audit log entry. Called from controllers (not as a middleware in the route chain)
 * because we need the entity data after it's been created/modified.
 */
const createAuditLog = async ({
  businessId,
  userId,
  userEmail,
  userRole,
  module,
  action,
  entityType = null,
  entityId   = null,
  description= null,
  oldData    = null,
  newData    = null,
  ipAddress  = null,
  userAgent  = null,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        businessId,
        userId,
        userEmail,
        userRole,
        module,
        action,
        entityType,
        entityId,
        description,
        oldData,
        newData,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    // Audit failures should never crash the main operation
    logger.error('Audit log failed:', err.message);
  }
};

/**
 * Helper to extract request metadata for audit logs
 */
const getRequestMeta = (req) => ({
  ipAddress: req.ip || req.connection?.remoteAddress,
  userAgent: req.get('user-agent'),
  userId:    req.user?.id,
  userEmail: req.user?.email,
  userRole:  req.user?.role,
  businessId:req.user?.businessId,
});

/**
 * Express middleware that adds an `audit()` helper to req
 * so controllers can log with minimal boilerplate:
 *   await req.audit({ module: 'invoicing', action: 'CREATE', ... })
 */
const auditMiddleware = (req, res, next) => {
  req.audit = (params) => {
    const meta = getRequestMeta(req);
    return createAuditLog({ ...meta, ...params });
  };
  next();
};

module.exports = { createAuditLog, getRequestMeta, auditMiddleware };
