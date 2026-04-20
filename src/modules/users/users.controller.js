const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma }   = require('../../config/database');
const { env }      = require('../../config/env');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination, buildSearchFilter, getSortOrder } = require('../../utils/pagination.util');
const { emails }   = require('../../utils/email.util');
const { DEFAULT_ROLE_PERMISSIONS } = require('../../constants/roles');

const SAFE_USER_SELECT = {
  id: true, name: true, email: true, phone: true, role: true,
  isActive: true, avatar: true, lastLoginAt: true, createdAt: true,
  permissions: { select: { module: true, actions: true } },
  employee: { select: { id: true, department: true, designation: true } },
};

// GET /users
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const search  = buildSearchFilter(req.query.search, ['name', 'email']);
  const orderBy = getSortOrder(req.query, ['name', 'email', 'role', 'createdAt']);

  const where = {
    businessId: req.businessId,
    ...search,
    ...(req.query.role     && { role:     req.query.role }),
    ...(req.query.isActive !== undefined && { isActive: req.query.isActive === 'true' }),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, skip, take: limit, orderBy, select: SAFE_USER_SELECT }),
    prisma.user.count({ where }),
  ]);

  return paginatedResponse(res, { data: users, page, limit, total });
});

// GET /users/:id
exports.getUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({
    where:  { id: req.params.id, businessId: req.businessId },
    select: SAFE_USER_SELECT,
  });
  if (!user) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'User not found.' });
  return successResponse(res, { data: user });
});

// POST /users/invite
exports.inviteUser = asyncHandler(async (req, res) => {
  const { name, email, role, phone } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return errorResponse(res, { status: HTTP.CONFLICT, message: 'Email already registered.' });

  const tempPassword = crypto.randomBytes(8).toString('hex');
  const hashed       = await bcrypt.hash(tempPassword, env.BCRYPT_SALT_ROUNDS);

  const perms = DEFAULT_ROLE_PERMISSIONS[role] || {};
  const permissionsData = Object.entries(perms).map(([module, actions]) => ({ module, actions }));

  const user = await prisma.user.create({
    data: {
      businessId: req.businessId,
      name, email, phone, role,
      password:   hashed,
      permissions: { create: permissionsData },
    },
    select: SAFE_USER_SELECT,
  });

  const business = await prisma.business.findUnique({
    where: { id: req.businessId }, select: { name: true },
  });

  await emails.welcomeUser({
    name, email, tempPassword,
    businessName: business.name,
    loginUrl: `${env.FRONTEND_URL}/login`,
    businessId: req.businessId,
  });

  await req.audit({ module: 'users', action: 'CREATE', entityType: 'User', entityId: user.id, description: `Invited user ${email}` });

  return successResponse(res, { status: HTTP.CREATED, message: 'User invited successfully.', data: user });
});

// PATCH /users/:id
exports.updateUser = asyncHandler(async (req, res) => {
  const { name, phone, avatar, role, isActive } = req.body;

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
  });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'User not found.' });

  const data = {};
  if (name     !== undefined) data.name     = name;
  if (phone    !== undefined) data.phone    = phone;
  if (avatar   !== undefined) data.avatar   = avatar;
  if (isActive !== undefined) data.isActive = isActive;

  // Only admins can change roles
  if (role !== undefined && ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    data.role = role;
  }

  const user = await prisma.user.update({
    where:  { id: req.params.id },
    data,
    select: SAFE_USER_SELECT,
  });

  await req.audit({ module: 'users', action: 'UPDATE', entityType: 'User', entityId: user.id });

  return successResponse(res, { message: 'User updated.', data: user });
});

// DELETE /users/:id (soft deactivate)
exports.deactivateUser = asyncHandler(async (req, res) => {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
  });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'User not found.' });
  if (existing.id === req.user.id) {
    return errorResponse(res, { status: HTTP.BAD_REQUEST, message: 'You cannot deactivate your own account.' });
  }

  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false, refreshToken: null } });

  await req.audit({ module: 'users', action: 'DEACTIVATE', entityType: 'User', entityId: req.params.id });

  return successResponse(res, { message: 'User deactivated.' });
});

// PUT /users/:id/permissions  – Full permission override for a user
exports.setPermissions = asyncHandler(async (req, res) => {
  const { permissions } = req.body; // [{ module, actions[] }]

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, businessId: req.businessId },
  });
  if (!existing) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'User not found.' });

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId: req.params.id } }),
    prisma.userPermission.createMany({
      data: permissions.map(({ module, actions }) => ({
        userId: req.params.id,
        module,
        actions,
      })),
    }),
  ]);

  await req.audit({
    module: 'users', action: 'UPDATE_PERMISSIONS',
    entityType: 'User', entityId: req.params.id,
    description: `Updated permissions for user ${existing.email}`,
  });

  return successResponse(res, { message: 'Permissions updated successfully.' });
});

// GET /users/:id/permissions
exports.getPermissions = asyncHandler(async (req, res) => {
  const perms = await prisma.userPermission.findMany({
    where: { userId: req.params.id },
  });
  return successResponse(res, { data: perms });
});

// PATCH /users/profile  – user updating their own profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, avatar } = req.body;
  const user = await prisma.user.update({
    where:  { id: req.user.id },
    data:   { name, phone, avatar },
    select: SAFE_USER_SELECT,
  });
  return successResponse(res, { message: 'Profile updated.', data: user });
});
