const router = require('express').Router();
const ctrl   = require('./reports.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { exportLimiter } = require('../../middleware/rateLimiter.middleware');

router.use(authenticate);

router.get('/sales',               checkPermission('reports','view'),   ctrl.salesReport);
router.get('/expenses',            checkPermission('reports','view'),   ctrl.expenseReport);
router.get('/employees',           checkPermission('reports','view'),   ctrl.employeeReport);
router.get('/inventory',           checkPermission('reports','view'),   ctrl.inventoryReport);
router.get('/gst',                 checkPermission('reports','view'),   ctrl.gstReport);
router.get('/invoice-statement',   checkPermission('invoice_statements','view'),   exportLimiter, ctrl.exportInvoiceStatement);

module.exports = router;
