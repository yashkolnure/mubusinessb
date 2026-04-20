const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma }  = require('../../config/database');
const { env }     = require('../../config/env');
const { asyncHandler, AppError } = require('../../utils/appError.util');
const { successResponse, errorResponse, HTTP } = require('../../utils/response.util');
const { emails }  = require('../../utils/email.util');
const { DEFAULT_ROLE_PERMISSIONS, ROLES } = require('../../constants/roles');
const logger = require('../../config/logger');

// ─── Token Helpers ────────────────────────────────────────────────────────────
const signAccessToken  = (userId, businessId, role) =>
  jwt.sign({ userId, businessId, role }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });

const signRefreshToken = (userId) =>
  jwt.sign({ userId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure:   env.IS_PRODUCTION,
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// ─── Build initial permissions for a role ─────────────────────────────────────
const buildDefaultPermissions = (role) => {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] || {};
  return Object.entries(defaults).map(([module, actions]) => ({ module, actions }));
};

// ─── Register Business + Super Admin ─────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { businessName, name, email, password, phone } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return errorResponse(res, { status: HTTP.CONFLICT, message: 'Email already registered.' });
  }

  const hashedPassword = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: { name: businessName },
    });

    const user = await tx.user.create({
      data: {
        businessId: business.id,
        name,
        email,
        password:   hashedPassword,
        phone,
        role:       ROLES.SUPER_ADMIN,
        emailVerified: true, // can add verification flow later
        permissions: {
          create: buildDefaultPermissions(ROLES.SUPER_ADMIN),
        },
      },
      select: { id: true, name: true, email: true, role: true, businessId: true },
    });

    return { business, user };
  });

  const accessToken  = signAccessToken(result.user.id, result.business.id, result.user.role);
  const refreshToken = signRefreshToken(result.user.id);

  await prisma.user.update({
    where: { id: result.user.id },
    data:  { refreshToken: await bcrypt.hash(refreshToken, 10) },
  });

  setRefreshCookie(res, refreshToken);

  logger.info(`New business registered: ${result.business.name} by ${email}`);

  return successResponse(res, {
    status:  HTTP.CREATED,
    message: 'Business account created successfully.',
    data: { user: result.user, business: result.business, accessToken },
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      permissions: { select: { module: true, actions: true } },
      business:    { select: { id: true, name: true, isActive: true, currency: true, currencySymbol: true } },
    },
  });

  // Generic message to prevent user enumeration
  if (!user) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Invalid email or password.' });
  }

  // Lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return errorResponse(res, {
      status:  HTTP.UNAUTHORIZED,
      message: `Account locked until ${user.lockedUntil.toISOString()}. Too many failed attempts.`,
    });
  }

  if (!user.isActive) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Account deactivated. Contact your administrator.' });
  }

  if (!user.business.isActive) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Business account inactive.' });
  }

  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    const attempts = user.failedLoginAttempts + 1;
    const updateData = { failedLoginAttempts: attempts };
    if (attempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // lock 30 min
    }
    await prisma.user.update({ where: { id: user.id }, data: updateData });
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Invalid email or password.' });
  }

  // Reset failed attempts
  const accessToken  = signAccessToken(user.id, user.businessId, user.role);
  const refreshToken = signRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil:  null,
      lastLoginAt:  new Date(),
      lastLoginIp:  ip,
      refreshToken: await bcrypt.hash(refreshToken, 10),
    },
  });

  setRefreshCookie(res, refreshToken);

  const { password: _p, refreshToken: _r, ...safeUser } = user;

  return successResponse(res, {
    message: 'Login successful.',
    data:    { user: safeUser, accessToken },
  });
});

// ─── Refresh Access Token ─────────────────────────────────────────────────────
exports.refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!token) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Refresh token missing.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Invalid or expired refresh token.' });
  }

  const user = await prisma.user.findUnique({
    where:  { id: decoded.userId },
    select: { id: true, businessId: true, role: true, refreshToken: true, isActive: true },
  });

  if (!user || !user.isActive || !user.refreshToken) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Session invalid. Please login again.' });
  }

  const tokenValid = await bcrypt.compare(token, user.refreshToken);
  if (!tokenValid) {
    return errorResponse(res, { status: HTTP.UNAUTHORIZED, message: 'Token mismatch. Please login again.' });
  }

  const newAccessToken  = signAccessToken(user.id, user.businessId, user.role);
  const newRefreshToken = signRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data:  { refreshToken: await bcrypt.hash(newRefreshToken, 10) },
  });

  setRefreshCookie(res, newRefreshToken);

  return successResponse(res, { message: 'Token refreshed.', data: { accessToken: newAccessToken } });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data:  { refreshToken: null },
  });

  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');

  await req.audit({ module: 'auth', action: 'LOGOUT' });

  return successResponse(res, { message: 'Logged out successfully.' });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });

  // Always return success to prevent user enumeration
  if (!user) {
    return successResponse(res, { message: 'If this email exists, a reset link has been sent.' });
  }

  const resetToken   = crypto.randomBytes(32).toString('hex');
  const hashedToken  = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiry       = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordResetToken: hashedToken, passwordResetExpires: expiry },
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  await emails.passwordReset({ name: user.name, email: user.email, resetUrl });

  return successResponse(res, { message: 'If this email exists, a reset link has been sent.' });
});

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken:   hashedToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Reset token is invalid or has expired.' });
  }

  const hashedPassword = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data:  {
      password:             hashedPassword,
      passwordResetToken:   null,
      passwordResetExpires: null,
      failedLoginAttempts:  0,
      lockedUntil:          null,
    },
  });

  return successResponse(res, { message: 'Password reset successfully. Please login.' });
});

// ─── Change Password (authenticated) ─────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'Current password is incorrect.' });
  }

  const hashed = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: req.user.id },
    data:  { password: hashed, refreshToken: null },
  });

  res.clearCookie('refreshToken');

  await req.audit({ module: 'auth', action: 'CHANGE_PASSWORD' });

  return successResponse(res, { message: 'Password changed. Please login again.' });
});

// ─── Get Current User (me) ────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id:          true,
      name:        true,
      email:       true,
      phone:       true,
      role:        true,
      avatar:      true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      createdAt:   true,
      permissions: { select: { module: true, actions: true } },
      business: {
        select: {
          id:            true,
          name:          true,
          logo:          true,
          currency:      true,
          currencySymbol:true,
          gstin:         true,
          dateFormat:    true,
          timezone:      true,
        },
      },
    },
  });

  return successResponse(res, { data: user });
});
