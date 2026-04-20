const router = require('express').Router();
const ctrl   = require('./audit.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth.middleware');

router.use(authenticate, requireAdmin);

router.get('/',    ctrl.listAuditLogs);
router.get('/:id', ctrl.getAuditLog);

module.exports = router;
