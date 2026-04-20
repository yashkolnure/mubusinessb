const router = require('express').Router();
const ctrl   = require('./quotations.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

const quotationValidator = [
  body('clientId').notEmpty().withMessage('Client is required.'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required.'),
  body('items.*.description').notEmpty(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.unitPrice').isFloat({ gt: 0 }),
];

router.use(authenticate);

router.get   ('/',                       checkPermission('quotations','view'),   ctrl.listQuotations);
router.get   ('/:id',                    checkPermission('quotations','view'),   ctrl.getQuotation);
router.post  ('/',                       checkPermission('quotations','create'), quotationValidator, validate, ctrl.createQuotation);
router.patch ('/:id',                    checkPermission('quotations','edit'),   ctrl.updateQuotation);
router.patch ('/:id/status',             checkPermission('quotations','edit'),   ctrl.updateStatus);
router.post  ('/:id/send',               checkPermission('quotations','edit'),   ctrl.sendQuotation);
router.post  ('/:id/convert-to-invoice', checkPermission('invoicing','create'),  ctrl.convertToInvoice);
router.delete('/:id',                    checkPermission('quotations','delete'), ctrl.deleteQuotation);

module.exports = router;
