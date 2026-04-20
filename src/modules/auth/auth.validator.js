const { body } = require('express-validator');

exports.registerValidator = [
  body('businessName').trim().notEmpty().withMessage('Business name is required.').isLength({ max: 100 }),
  body('name').trim().notEmpty().withMessage('Name is required.').isLength({ max: 80 }),
  body('email').trim().isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and a number.'),
];

exports.loginValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

exports.forgotPasswordValidator = [
  body('email').trim().isEmail().withMessage('Valid email is required.').normalizeEmail(),
];

exports.resetPasswordValidator = [
  body('token').notEmpty().withMessage('Reset token is required.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and a number.'),
];

exports.changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase and a number.'),
];
