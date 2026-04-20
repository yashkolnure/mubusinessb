const router = require('express').Router();
const ctrl   = require('./inventory.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

router.use(authenticate);

router.get   ('/summary',          checkPermission('inventory','view'),   ctrl.getInventorySummary);
router.get   ('/low-stock',        checkPermission('inventory','view'),   ctrl.getLowStockProducts);
router.get   ('/',                 checkPermission('inventory','view'),   ctrl.listProducts);
router.get   ('/:id',              checkPermission('inventory','view'),   ctrl.getProduct);
router.get   ('/:id/stock-logs',   checkPermission('inventory','view'),   ctrl.getStockLogs);
router.post  ('/',                 checkPermission('inventory','create'), [
  body('name').notEmpty().withMessage('Product name required'),
  body('sellingPrice').isFloat({ min: 0 }).withMessage('Selling price required'),
], validate, ctrl.createProduct);
router.patch ('/:id',              checkPermission('inventory','edit'),   ctrl.updateProduct);
router.delete('/:id',              checkPermission('inventory','delete'), ctrl.deleteProduct);
router.post  ('/:id/stock-adjust', checkPermission('inventory','edit'),   [
  body('type').isIn(['IN','OUT','ADJUSTMENT','RETURN']).withMessage('Invalid type'),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive'),
], validate, ctrl.adjustStock);

module.exports = router;
