/**
 * Role-Based Access Control Middleware
 * 
 * Factory function that returns middleware checking req.user.role
 * against a list of allowed roles.
 * 
 * Usage:
 *   router.get('/admin-only', requireRole('admin'), handler);
 *   router.get('/multi-role', requireRole('admin', 'salesman'), handler);
 */

/**
 * Returns middleware that checks if the authenticated user has one of the allowed roles.
 * Must be used AFTER verifyToken middleware (which sets req.user).
 * 
 * @param {...string} allowedRoles - Roles that are permitted access
 * @returns {Function} Express middleware
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions.',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
}

module.exports = requireRole;
