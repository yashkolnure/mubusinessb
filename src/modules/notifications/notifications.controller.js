const { prisma }   = require('../../config/database');
const { asyncHandler } = require('../../utils/appError.util');
const { successResponse, errorResponse, paginatedResponse, HTTP } = require('../../utils/response.util');
const { getPagination } = require('../../utils/pagination.util');

// ── CREATE NOTIFICATION (internal helper, not exposed as route) ───────────────
const createNotification = async ({ businessId, userId, type, title, message, data = null, link = null }) => {
  return prisma.notification.create({
    data: { businessId, userId, type, title, message, data, link },
  });
};

// ── CREATE BULK NOTIFICATIONS (for all admins, or all users) ─────────────────
const createBulkNotifications = async ({ businessId, roles = [], type, title, message, data = null, link = null }) => {
  const users = await prisma.user.findMany({
    where: { businessId, isActive: true, ...(roles.length > 0 && { role: { in: roles } }) },
    select: { id: true },
  });

  if (!users.length) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({ businessId, userId: u.id, type, title, message, data, link })),
  });
};

// ── GET MY NOTIFICATIONS ──────────────────────────────────────────────────────
exports.listNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);

  const where = {
    userId:     req.user.id,
    businessId: req.businessId,
    ...(req.query.isRead !== undefined && { isRead: req.query.isRead === 'true' }),
  };

  const [notifications, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: req.user.id, businessId: req.businessId, isRead: false } }),
  ]);

  return paginatedResponse(res, {
    data:    notifications,
    page, limit, total,
    message: 'Notifications retrieved.',
  });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user.id, businessId: req.businessId, isRead: false },
  });
  return successResponse(res, { data: { unreadCount: count } });
});

// ── MARK AS READ ──────────────────────────────────────────────────────────────
exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!notification) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Notification not found.' });

  await prisma.notification.update({
    where: { id: req.params.id },
    data:  { isRead: true, readAt: new Date() },
  });
  return successResponse(res, { message: 'Marked as read.' });
});

// ── MARK ALL AS READ ──────────────────────────────────────────────────────────
exports.markAllAsRead = asyncHandler(async (req, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: req.user.id, businessId: req.businessId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  return successResponse(res, { message: `${count} notification(s) marked as read.` });
});

// ── DELETE NOTIFICATION ───────────────────────────────────────────────────────
exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!notification) return errorResponse(res, { status: HTTP.NOT_FOUND, message: 'Notification not found.' });

  await prisma.notification.delete({ where: { id: req.params.id } });
  return successResponse(res, { message: 'Notification deleted.' });
});

// ── CLEAR ALL READ NOTIFICATIONS ──────────────────────────────────────────────
exports.clearReadNotifications = asyncHandler(async (req, res) => {
  const { count } = await prisma.notification.deleteMany({
    where: { userId: req.user.id, businessId: req.businessId, isRead: true },
  });
  return successResponse(res, { message: `${count} notification(s) cleared.` });
});

module.exports = {
  ...exports,
  createNotification,
  createBulkNotifications,
};
