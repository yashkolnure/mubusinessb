const router = require('express').Router();

// ── Health check ──────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.status(200).json({
    success:   true,
    status:    'healthy',
    timestamp: new Date().toISOString(),
    uptime:    `${Math.floor(process.uptime())}s`,
    environment: process.env.NODE_ENV,
  });
});

// ── Module routes ─────────────────────────────────────────────
router.use('/auth',          require('../modules/auth/auth.routes'));
router.use('/users',         require('../modules/users/users.routes'));
router.use('/dashboard',     require('../modules/dashboard/dashboard.routes'));
router.use('/clients',       require('../modules/clients/clients.routes'));
router.use('/invoices',      require('../modules/invoicing/invoicing.routes'));
router.use('/quotations',    require('../modules/quotations/quotations.routes'));
router.use('/workforce',     require('../modules/workforce/workforce.routes'));
router.use('/vendors',       require('../modules/vendors/vendors.routes'));
router.use('/inventory',     require('../modules/inventory/inventory.routes'));
router.use('/finance',       require('../modules/finance/finance.routes'));
router.use('/reports',       require('../modules/reports/reports.routes'));
router.use('/settings',      require('../modules/settings/settings.routes'));
router.use('/notifications', require('../modules/notifications/notifications.routes'));
router.use('/audit',         require('../modules/audit/audit.routes'));

module.exports = router;
