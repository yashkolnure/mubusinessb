const router = require('express').Router();
const ctrl   = require('./vendors.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');

router.use(authenticate);

router.get   ('/vendors',                       checkPermission('vendors','view'),   ctrl.listVendors);
router.get   ('/vendors/:id',                   checkPermission('vendors','view'),   ctrl.getVendor);
router.post  ('/vendors',                       checkPermission('vendors','create'), ctrl.createVendor);
router.patch ('/vendors/:id',                   checkPermission('vendors','edit'),   ctrl.updateVendor);
router.delete('/vendors/:id',                   checkPermission('vendors','delete'), ctrl.deleteVendor);

router.get   ('/purchases',                     checkPermission('purchases','view'),   ctrl.listPurchases);
router.get   ('/purchases/:id',                 checkPermission('purchases','view'),   ctrl.getPurchase);
router.post  ('/purchases',                     checkPermission('purchases','create'), ctrl.createPurchase);
router.patch ('/purchases/:id/status',          checkPermission('purchases','edit'),   ctrl.updatePurchaseStatus);
router.post  ('/purchases/:id/payments',        checkPermission('purchases','edit'),   ctrl.recordVendorPayment);

module.exports = router;
