const settingsService = require('../services/settingsService');

/**
 * Middleware factory — enforces a salesman_permissions flag.
 *
 * - Admin: always allowed through.
 * - Salesman: allowed only if the named permission is true in the
 *   `salesman_permissions` settings key.
 * - Any other role: 403.
 *
 * Usage:
 *   router.post('/', checkSalesmanPermission('exchange_allowed'), handler);
 *   router.post('/', checkSalesmanPermission('cancellation_allowed'), handler);
 *
 * @param {string} permissionKey - Key inside salesman_permissions JSON
 * @returns {Function} Express middleware
 */
function checkSalesmanPermission(permissionKey) {
  return async (req, res, next) => {
    const role = req.user?.role;

    // Admin is always allowed
    if (role === 'admin') return next();

    // Non-salesman roles are not allowed
    if (role !== 'salesman') {
      return res.status(403).json({
        error: 'Insufficient permissions.',
        current: role,
      });
    }

    // Salesman: check the specific permission flag
    try {
      const setting = await settingsService.getByKey('salesman_permissions');
      if (!setting?.setting_value) {
        return res.status(403).json({
          error: `Permission '${permissionKey}' is not configured. Contact admin.`,
        });
      }

      const permissions = JSON.parse(setting.setting_value);
      if (!permissions[permissionKey]) {
        return res.status(403).json({
          error: `Action not allowed. '${permissionKey}' is disabled by admin.`,
        });
      }

      return next();
    } catch (err) {
      console.error('checkSalesmanPermission: failed to read settings', err);
      return res.status(500).json({ error: 'Failed to verify permissions.' });
    }
  };
}

module.exports = checkSalesmanPermission;
