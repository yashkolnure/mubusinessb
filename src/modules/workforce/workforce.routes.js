const router = require('express').Router();
const ctrl   = require('./workforce.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { checkPermission } = require('../../middleware/permission.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { body } = require('express-validator');

router.use(authenticate);

// Employees
router.get   ('/employees',                  checkPermission('workforce','view'),   ctrl.listEmployees);
router.get   ('/employees/:id',              checkPermission('workforce','view'),   ctrl.getEmployee);
router.post  ('/employees',                  checkPermission('workforce','create'), [
  body('name').notEmpty().withMessage('Name required'),
], validate, ctrl.createEmployee);
router.patch ('/employees/:id',              checkPermission('workforce','edit'),   ctrl.updateEmployee);
router.delete('/employees/:id',              checkPermission('workforce','delete'), ctrl.deleteEmployee);

// Attendance
router.get   ('/attendance',                 checkPermission('workforce','view'),   ctrl.listAttendance);
router.post  ('/attendance',                 checkPermission('workforce','create'), ctrl.markAttendance);
router.post  ('/attendance/bulk',            checkPermission('workforce','create'), ctrl.bulkMarkAttendance);
router.get   ('/attendance/summary',         checkPermission('workforce','view'),   ctrl.getAttendanceSummary);

// Leaves
router.get   ('/leaves',                     checkPermission('workforce','view'),   ctrl.listLeaveRequests);
router.post  ('/leaves',                     checkPermission('workforce','create'), ctrl.createLeaveRequest);
router.patch ('/leaves/:id/status',          checkPermission('workforce','approve'),ctrl.updateLeaveStatus);

// Salary
router.get   ('/salaries',                   checkPermission('workforce','view'),   ctrl.listSalaries);
router.post  ('/salaries',                   checkPermission('workforce','create'), ctrl.createSalary);
router.patch ('/salaries/:id/mark-paid',     checkPermission('workforce','edit'),   ctrl.markSalaryPaid);

module.exports = router;
