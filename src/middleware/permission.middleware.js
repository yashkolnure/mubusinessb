const { errorResponse, HTTP } = require('../utils/response.util');
const { ROLES }               = require('../constants/roles');

// ============================================================
// MODULE + ACTION PERMISSION CHECK
// ============================================================
/**
 * Usage: checkPermission('invoicing', 'create')
 * SUPER_ADMIN and ADMIN always pass.
 * For other roles, checks the UserPermission table entries
 * attached to req.user.permissions.
 */
const checkPermission = (module, action) => (req, res, next) => {
  const { user } = req;

  if (!user) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Authentication required.' });
  }

  // Admins have all permissions
  if ([ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(user.role)) {
    return next();
  }

  // Check the permissions array attached during authenticate()
  const modulePerm = user.permissions?.find((p) => p.module === module);

  if (!modulePerm || !modulePerm.actions.includes(action)) {
    return errorResponse(res, {
      status:  HTTP.FORBIDDEN,
      message: `You don't have permission to ${action} in ${module}.`,
    });
  }

  next();
};

// ============================================================
// SELF-ONLY GUARD – used for staff accessing their own data
// Checks req.params.employeeId or req.params.userId
// ============================================================
const selfOrAdmin = (idParam = 'employeeId') => async (req, res, next) => {
  const { user } = req;

  if ([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.HR].includes(user.role)) {
    return next();
  }

  // For staff, validate they are accessing their own resource
  const requestedId = req.params[idParam];

  // If employee ID is being accessed, verify it belongs to the current user
  if (user.employee && user.employee.id === requestedId) {
    return next();
  }

  // If user ID is being accessed
  if (user.id === requestedId) {
    return next();
  }

  return errorResponse(res, {
    status:  HTTP.FORBIDDEN,
    message: 'You can only access your own data.',
  });
};

// ============================================================
// BUSINESS ISOLATION – ensures resources belong to req.businessId
// ============================================================
const belongsToBusinessGuard = (model, idParam = 'id') => async (req, res, next) => {
  try {
    const { prisma } = require('../config/database');
    const record = await prisma[model].findUnique({
      where:  { id: req.params[idParam] },
      select: { businessId: true },
    });

    if (!record) {
      return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Resource not found.' });
    }

    if (record.businessId !== req.businessId) {
      return errorResponse(res, {
        status:  HTTP.FORBIDDEN,
        message: 'Access to this resource is not allowed.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkPermission, selfOrAdmin, belongsToBusinessGuard };
