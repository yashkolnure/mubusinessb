const router = require('express').Router();
const ctrl   = require('./clients.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

const clientValidator = [
  body('name').trim().notEmpty().withMessage('Client name is required.'),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim(),
];

router.use(authenticate);

router.get   ('/',                checkPermission('clients','view'),   ctrl.listClients);
router.get   ('/:id',             checkPermission('clients','view'),   ctrl.getClient);
router.get   ('/:id/activity',    checkPermission('clients','view'),   ctrl.getClientActivity);
router.get   ('/:id/statement',   checkPermission('invoice_statements','view'), ctrl.getClientStatement);
router.post  ('/',                checkPermission('clients','create'), clientValidator, validate, ctrl.createClient);
router.patch ('/:id',             checkPermission('clients','edit'),   ctrl.updateClient);
router.delete('/:id',             checkPermission('clients','delete'), ctrl.deleteClient);

module.exports = router;
