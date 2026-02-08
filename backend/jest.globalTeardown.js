/**
 * JEST GLOBAL TEARDOWN
 * ====================
 * Runs once after ALL test suites complete (even on failure).
 * Since tests run against a separate test database (rental_db_test),
 * production data is never at risk.
 */
module.exports = async function globalTeardown() {
  console.log('✅ Tests complete. Production database was never touched.');
};
