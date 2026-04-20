// ============================================================
// ROLES
// ============================================================
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN:       'ADMIN',
  MANAGER:     'MANAGER',
  ACCOUNTANT:  'ACCOUNTANT',
  HR:          'HR',
  STAFF:       'STAFF',
};

// ============================================================
// MODULES
// ============================================================
const MODULES = {
  AUTH:              'auth',
  USERS:             'users',
  CLIENTS:           'clients',
  WORKFORCE:         'workforce',
  QUOTATIONS:        'quotations',
  INVOICING:         'invoicing',
  INVOICE_STATEMENTS:'invoice_statements',
  VENDORS:           'vendors',
  PURCHASES:         'purchases',
  INVENTORY:         'inventory',
  FINANCE:           'finance',
  REPORTS:           'reports',
  SETTINGS:          'settings',
  NOTIFICATIONS:     'notifications',
  AUDIT:             'audit',
};

// ============================================================
// ACTIONS
// ============================================================
const ACTIONS = {
  VIEW:   'view',
  CREATE: 'create',
  EDIT:   'edit',
  DELETE: 'delete',
  EXPORT: 'export',
  APPROVE:'approve',
};

// ============================================================
// DEFAULT PERMISSIONS PER ROLE
// These are applied when a new user is created.
// Admins can override per-user permissions later.
// ============================================================
const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: {
    // Super admin has all permissions on all modules
    ...Object.fromEntries(
      Object.values(MODULES).map((mod) => [mod, Object.values(ACTIONS)])
    ),
  },
  [ROLES.ADMIN]: {
    ...Object.fromEntries(
      Object.values(MODULES).map((mod) => [mod, Object.values(ACTIONS)])
    ),
  },
  [ROLES.MANAGER]: {
    [MODULES.CLIENTS]:           [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT],
    [MODULES.QUOTATIONS]:        [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.DELETE, ACTIONS.EXPORT],
    [MODULES.INVOICING]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.EXPORT],
    [MODULES.INVOICE_STATEMENTS]:[ACTIONS.VIEW, ACTIONS.EXPORT],
    [MODULES.WORKFORCE]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT],
    [MODULES.VENDORS]:           [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT],
    [MODULES.PURCHASES]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT],
    [MODULES.INVENTORY]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT],
    [MODULES.FINANCE]:           [ACTIONS.VIEW, ACTIONS.CREATE],
    [MODULES.REPORTS]:           [ACTIONS.VIEW, ACTIONS.EXPORT],
    [MODULES.NOTIFICATIONS]:     [ACTIONS.VIEW],
  },
  [ROLES.ACCOUNTANT]: {
    [MODULES.CLIENTS]:           [ACTIONS.VIEW],
    [MODULES.QUOTATIONS]:        [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.EXPORT],
    [MODULES.INVOICING]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.DELETE, ACTIONS.EXPORT],
    [MODULES.INVOICE_STATEMENTS]:[ACTIONS.VIEW, ACTIONS.EXPORT],
    [MODULES.VENDORS]:           [ACTIONS.VIEW],
    [MODULES.PURCHASES]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.EXPORT],
    [MODULES.FINANCE]:           [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.DELETE, ACTIONS.EXPORT],
    [MODULES.REPORTS]:           [ACTIONS.VIEW, ACTIONS.EXPORT],
    [MODULES.NOTIFICATIONS]:     [ACTIONS.VIEW],
  },
  [ROLES.HR]: {
    [MODULES.WORKFORCE]:         [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.EDIT, ACTIONS.DELETE, ACTIONS.EXPORT, ACTIONS.APPROVE],
    [MODULES.NOTIFICATIONS]:     [ACTIONS.VIEW],
    [MODULES.REPORTS]:           [ACTIONS.VIEW, ACTIONS.EXPORT],
  },
  [ROLES.STAFF]: {
    [MODULES.NOTIFICATIONS]:     [ACTIONS.VIEW],
    // Staff can only see their own data – enforced in controllers via req.user
  },
};

module.exports = { ROLES, MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS };
