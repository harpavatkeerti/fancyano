/**
 * Route Permissions Configuration — SINGLE SOURCE OF TRUTH
 * 
 * Maps API route prefixes to allowed roles.
 * Routes not listed under `routes` default to: any authenticated user.
 * Routes listed under `public` require no authentication at all.
 * 
 * To change access for any API route, modify this file only.
 */

const routePermissions = {
  // Public routes — no authentication required
  public: [
    '/api/auth',
    '/api/health'
  ],

  // Route → allowed roles mapping
  // Routes not listed here default to: any authenticated user
  routes: {
    '/api/policies':         ['admin'],
    '/api/credit-notes':     ['admin'],
    '/api/vendors':          ['admin'],
    '/api/booking-discard':  ['admin'],
    // Add more role-restricted routes as needed — one-line change to modify access
  },

  // Route → route file name mapping (used by server.js to require() the right file)
  // All non-public routes must be listed here.
  files: {
    // Role-restricted
    '/api/users':               'users',
    '/api/settings':            'settings',
    '/api/policies':            'policies',
    '/api/credit-notes':        'creditNotes',
    '/api/vendors':             'vendors',
    // Shared (any authenticated user)
    '/api/products':            'products',
    '/api/bookings':            'bookings',
    '/api/product-tracking':    'productTracking',
    '/api/invoices':            'invoices',
    '/api/payment-transactions':'paymentTransactions',
    '/api/availability':        'availability',
    '/api/complaints':          'complaints',
    '/api/feedback':            'feedback',
    '/api/product-exchanges':   'productExchanges',
    '/api/booking-cancellation':'bookingCancellation',
    '/api/booking-discard':     'bookingDiscard',
    '/api/lifecycle':           'productLifecycle',
    '/api/booking-preview':     'bookingPreview',
  }
};

module.exports = routePermissions;
