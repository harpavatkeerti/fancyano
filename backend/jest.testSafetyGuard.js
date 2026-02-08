/**
 * TEST SAFETY GUARD
 * =================
 * Prevents tests from accidentally wiping production data.
 * 
 * Loaded via jest.config.js `setupFiles`.
 * Patches pg.Pool and pg.Client prototypes to block:
 *   - Unscoped DELETE FROM <table> (no WHERE clause)
 *   - TRUNCATE TABLE
 * 
 * If a test tries to wipe an entire table, it gets a loud error
 * instead of silently destroying data.
 */

const { Pool, Client } = require('pg');

// Tables that hold production data — unscoped deletes are BLOCKED
const PROTECTED_TABLES = [
  'bookings',
  'booking_products',
  'booking_activity_log',
  'booking_cancellation_history',
  'booking_exchange_history',
  'payment_transactions',
  'product_charges',
  'products',
  'rental_policies',
  'settings',
];

function validateQuery(sql) {
  if (typeof sql !== 'string') return;

  const normalized = sql.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  // Block TRUNCATE on any protected table
  for (const table of PROTECTED_TABLES) {
    if (upper.match(new RegExp(`TRUNCATE\\s+(TABLE\\s+)?(ONLY\\s+)?${table.toUpperCase()}`))) {
      throw new Error(
        `\n🛑 TEST SAFETY GUARD: TRUNCATE ${table} is BLOCKED!\n` +
        `Tests must NEVER wipe entire tables.\n` +
        `Query: ${normalized.substring(0, 300)}\n`
      );
    }
  }

  // Block unscoped DELETE FROM <table> (no WHERE clause)
  for (const table of PROTECTED_TABLES) {
    // Match DELETE FROM <table> that ends without a WHERE
    const pattern = new RegExp(
      `DELETE\\s+FROM\\s+(ONLY\\s+)?${table}\\s*(;|\\s*$)`,
      'i'
    );
    if (pattern.test(normalized)) {
      throw new Error(
        `\n🛑 TEST SAFETY GUARD: Unscoped DELETE FROM ${table} is BLOCKED!\n` +
        `This would wipe ALL rows, destroying production data.\n\n` +
        `FIX: Add a WHERE clause to scope to test data only.\n` +
        `  Bad:  DELETE FROM ${table}\n` +
        `  Good: DELETE FROM ${table} WHERE customer_phone = 'TEST-PHONE'\n` +
        `  Good: DELETE FROM ${table} WHERE id = ANY($1)\n` +
        `  Good: DELETE FROM ${table} WHERE policy_key LIKE 'test_%'\n\n` +
        `Query: ${normalized.substring(0, 300)}\n`
      );
    }
  }
}

// Patch Pool.prototype.query
const origPoolQuery = Pool.prototype.query;
Pool.prototype.query = function (text, ...args) {
  validateQuery(typeof text === 'object' && text !== null ? text.text : text);
  return origPoolQuery.call(this, text, ...args);
};

// Patch Client.prototype.query (used by pool.connect() clients)
const origClientQuery = Client.prototype.query;
Client.prototype.query = function (text, ...args) {
  validateQuery(typeof text === 'object' && text !== null ? text.text : text);
  return origClientQuery.call(this, text, ...args);
};
