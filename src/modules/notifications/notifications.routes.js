const router = require('express').Router();
const ctrl   = require('./notifications.controller');
const { authenticate } = require('../../middleware/auth.middleware');

router.use(authenticate);

router.get   ('/',                 ctrl.listNotifications);
router.get   ('/unread-count',     ctrl.getUnreadCount);
router.patch ('/mark-all-read',    ctrl.markAllAsRead);
router.delete('/clear-read',       ctrl.clearReadNotifications);
router.patch ('/:id/read',         ctrl.markAsRead);
router.delete('/:id',              ctrl.deleteNotification);

module.exports = router;
