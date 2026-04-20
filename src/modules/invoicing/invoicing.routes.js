const router = require('express').Router();
const ctrl   = require('./invoicing.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { exportLimiter } = require('../../middleware/rateLimiter.middleware');
const { body } = require('express-validator');

const invoiceValidator = [
  body('clientId').notEmpty().withMessage('Client is required.'),
  body('items').isArray({ min:1 }).withMessage('At least one item is required.'),
  body('items.*.description').notEmpty().withMessage('Item description required.'),
  body('items.*.quantity').isFloat({ gt:0 }).withMessage('Quantity must be positive.'),
  body('items.*.unitPrice').isFloat({ min:0 }).withMessage('Unit price must be 0 or more.'),
];

const paymentValidator = [
  body('amount').isFloat({ gt:0 }).withMessage('Amount must be positive.'),
  body('method').notEmpty().withMessage('Payment method required.'),
];

router.use(authenticate);

router.get   ('/',                          checkPermission('invoicing','view'),   ctrl.listInvoices);
router.get   ('/:id',                       checkPermission('invoicing','view'),   ctrl.getInvoice);
router.post  ('/',                          checkPermission('invoicing','create'), invoiceValidator, validate, ctrl.createInvoice);
router.patch ('/:id',                       checkPermission('invoicing','edit'),   ctrl.updateInvoice);
router.post  ('/:id/send',                  checkPermission('invoicing','edit'),   ctrl.sendInvoice);
router.post  ('/:id/resend',                checkPermission('invoicing','edit'),   ctrl.sendInvoice); // same handler
router.post  ('/:id/cancel',                checkPermission('invoicing','edit'),   ctrl.cancelInvoice);
router.post  ('/:id/duplicate',             checkPermission('invoicing','create'), ctrl.duplicateInvoice);
router.get   ('/:id/pdf',                   checkPermission('invoicing','view'),   exportLimiter, ctrl.downloadPDF);
router.post  ('/:id/payments',              checkPermission('invoicing','edit'),   paymentValidator, validate, ctrl.recordPayment);
router.delete('/:id/payments/:paymentId',   checkPermission('invoicing','delete'), ctrl.deletePayment);
// Credit notes
router.post  ('/:id/credit-notes',          checkPermission('invoicing','create'), ctrl.createCreditNote);
router.get   ('/:id/credit-notes',          checkPermission('invoicing','view'),   ctrl.listCreditNotes);

module.exports = router;
