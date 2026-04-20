const router = require('express').Router();
const ctrl   = require('./finance.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

router.use(authenticate);

router.get   ('/dashboard',  checkPermission('finance','view'),   ctrl.getDashboard);
router.get   ('/cash-flow',  checkPermission('finance','view'),   ctrl.getCashFlow);
router.get   ('/categories', checkPermission('finance','view'),   ctrl.getCategories);
router.get   ('/',           checkPermission('finance','view'),   ctrl.listEntries);
router.get   ('/:id',        checkPermission('finance','view'),   ctrl.getEntry);
router.post  ('/',           checkPermission('finance','create'), [
  body('type').isIn(['INCOME','EXPENSE']).withMessage('Type must be INCOME or EXPENSE'),
  body('category').notEmpty().withMessage('Category required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('date').isISO8601().withMessage('Valid date required'),
], validate, ctrl.createEntry);
router.patch ('/:id',        checkPermission('finance','edit'),   ctrl.updateEntry);
router.delete('/:id',        checkPermission('finance','delete'), ctrl.deleteEntry);

module.exports = router;
