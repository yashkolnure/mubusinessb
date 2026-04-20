const jwt    = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { env }    = require('../config/env');
const { AppError }= require('../utils/appError.util');
const { errorResponse, HTTP } = require('../utils/response.util');

// ============================================================
// VERIFY ACCESS TOKEN
// ============================================================
const authenticate = async (req, res, next) => {
  try {
    // Support both Authorization header and cookie
    let token = null;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Authentication required. Please login.' });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Access token expired. Please refresh.' });
      }
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Invalid token.' });
    }

    // Fetch user with permissions
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id:           true,
        businessId:   true,
        name:         true,
        email:        true,
        role:         true,
        isActive:     true,
        lockedUntil:  true,
        twoFactorEnabled: true,
        permissions:  { select: { module: true, actions: true } },
        business: {
          select: {
            id:          true,
            name:        true,
            currency:    true,
            currencySymbol: true,
            gstin:       true,
            isActive:    true,
          },
        },
      },
    });

    if (!user) {
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'User no longer exists.' });
    }
    if (!user.isActive) {
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Your account has been deactivated.' });
    }
    if (!user.business.isActive) {
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Your business account is inactive.' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Account temporarily locked due to multiple failed attempts.' });
    }

    // Attach user to request
    req.user = user;
    req.businessId = user.businessId;
    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================
// REQUIRE SPECIFIC ROLES
// ============================================================
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return errorResponse(res, {
      status:  HTTP.FORBIDDEN,
      message: `Access denied. Required role(s): ${roles.join(', ')}`,
    });
  }
  next();
};

// ============================================================
// REQUIRE SUPER_ADMIN OR ADMIN
// ============================================================
const requireAdmin = requireRole('SUPER_ADMIN', 'ADMIN');

module.exports = { authenticate, requireRole, requireAdmin };
