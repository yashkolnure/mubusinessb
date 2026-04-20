const router = require('express').Router();
const ctrl   = require('./users.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

router.use(authenticate);

// Own profile
router.get   ('/profile',            ctrl.getMe || ctrl.updateProfile);
router.patch ('/profile',            ctrl.updateProfile);

// Admin-only user management
router.get   ('/',                   requireAdmin, ctrl.listUsers);
router.get   ('/:id',                requireAdmin, ctrl.getUser);
router.post  ('/invite',             requireAdmin, [
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('role').isIn(['ADMIN','MANAGER','ACCOUNTANT','HR','STAFF']).withMessage('Invalid role'),
], validate, ctrl.inviteUser);
router.patch ('/:id',                requireAdmin, ctrl.updateUser);
router.delete('/:id',                requireAdmin, ctrl.deactivateUser);
router.put   ('/:id/permissions',    requireAdmin, [
  body('permissions').isArray().withMessage('Permissions must be an array'),
], validate, ctrl.setPermissions);
router.get   ('/:id/permissions',    requireAdmin, ctrl.getPermissions);

module.exports = router;
