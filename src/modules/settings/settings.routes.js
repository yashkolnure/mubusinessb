const router = require('express').Router();
const ctrl   = require('./settings.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

router.use(authenticate);

// Business profile
router.get   ('/business',         checkPermission('settings','view'),  ctrl.getBusinessProfile);
router.patch ('/business',         requireAdmin,                        ctrl.updateBusinessProfile);
router.post  ('/business/logo',    requireAdmin, ctrl.uploadMiddleware, ctrl.uploadLogo);
router.post  ('/numbering/reset',  requireAdmin, ctrl.resetNumbering);

// SMTP
router.get   ('/smtp',             requireAdmin, ctrl.getSMTPConfig);
router.put   ('/smtp',             requireAdmin, ctrl.updateSMTPConfig);
router.post  ('/smtp/test',        requireAdmin, ctrl.testSMTP);

// Tax configurations
router.get   ('/taxes',            checkPermission('settings','view'),  ctrl.listTaxConfigs);
router.post  ('/taxes',            requireAdmin, ctrl.createTaxConfig);
router.patch ('/taxes/:id',        requireAdmin, ctrl.updateTaxConfig);
router.delete('/taxes/:id',        requireAdmin, ctrl.deleteTaxConfig);

module.exports = router;
