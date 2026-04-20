const router = require('express').Router();
const ctrl   = require('./auth.controller');
const { validate }  = require('../../middleware/validate.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter, passwordResetLimiter } = require('../../middleware/rateLimiter.middleware');
const v = require('./auth.validator');

// Public routes
router.post('/register',       v.registerValidator,       validate, ctrl.register);
router.post('/login',          authLimiter, v.loginValidator, validate, ctrl.login);
router.post('/refresh-token',  ctrl.refreshToken);
router.post('/forgot-password',passwordResetLimiter, v.forgotPasswordValidator, validate, ctrl.forgotPassword);
router.post('/reset-password', v.resetPasswordValidator,  validate, ctrl.resetPassword);

// Protected routes
router.use(authenticate);
router.get ('/me',             ctrl.getMe);
router.post('/logout',         ctrl.logout);
router.patch('/change-password', v.changePasswordValidator, validate, ctrl.changePassword);

module.exports = router;
