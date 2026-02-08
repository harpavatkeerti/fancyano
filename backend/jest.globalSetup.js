/**
 * JEST GLOBAL SETUP
 * =================
 * Creates a separate test database (rental_db_test) before any tests run.
 * Schema is copied from production DB via pg_dump (or TEMPLATE fallback).
 * Data is NOT copied — only schema + essential seed data (policies).
 * 
 * This guarantees tests NEVER touch the production database.
 */
const { Client } = require('pg');
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  require('dotenv').config({ path: path.join(__dirname, '.env') });

  const prodDb = process.env.__PROD_DB_NAME || 'rental_db';
  const testDb = prodDb + '_test';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || 5432;
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD;

  const adminConfig = { host, port, user, database: 'postgres' };
  if (password && password.trim()) adminConfig.password = password;

  // 1. Connect to admin DB and prepare test database
  const admin = new Client(adminConfig);
  await admin.connect();

  // Kill any leftover connections to the test DB (from crashed previous runs)
  await admin.query(
    `SELECT pg_terminate_backend(pid) 
     FROM pg_stat_activity 
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [testDb]
  );

  // Drop old test DB
  await admin.query(`DROP DATABASE IF EXISTS "${testDb}"`);

  // 2. Create test DB with schema from production
  let usedTemplate = false;

  try {
    // Preferred: pg_dump --schema-only (works even with active production connections)
    await admin.query(`CREATE DATABASE "${testDb}"`);
    await admin.end();

    const env = { ...process.env };
    if (password) env.PGPASSWORD = password;

    execSync(
      `pg_dump -h ${host} -p ${port} -U ${user} --schema-only "${prodDb}" | psql -h ${host} -p ${port} -U ${user} -q "${testDb}"`,
      { env, stdio: 'pipe' }
    );
  } catch (pgDumpError) {
    // Fallback: CREATE DATABASE ... TEMPLATE (requires no other connections to prodDb)
    try {
      const admin2 = new Client(adminConfig);
      await admin2.connect();
      await admin2.query(`DROP DATABASE IF EXISTS "${testDb}"`);
      await admin2.query(`CREATE DATABASE "${testDb}" TEMPLATE "${prodDb}"`);
      await admin2.end();
      usedTemplate = true;
    } catch (templateError) {
      throw new Error(
        `Failed to create test database "${testDb}".\n` +
        `  pg_dump error: ${pgDumpError.message}\n` +
        `  Template error: ${templateError.message}\n` +
        `Ensure pg_dump is installed, or close all connections to "${prodDb}".`
      );
    }
  }

  // 3. Connect to test DB and prepare data
  const testConfig = { host, port, user, database: testDb };
  if (password && password.trim()) testConfig.password = password;

  const testClient = new Client(testConfig);
  await testClient.connect();

  // If TEMPLATE was used, production data was copied — clear it
  if (usedTemplate) {
    const tables = await testClient.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    if (tables.rows.length > 0) {
      const tableNames = tables.rows.map(r => `"${r.tablename}"`).join(', ');
      await testClient.query(`TRUNCATE ${tableNames} CASCADE`);
    }
  }

  // 4. Seed essential data that tests depend on
  await testClient.query(`
    INSERT INTO rental_policies (policy_key, policy_name, policy_type, value_type, value, days_from_booking_min, days_from_booking_max) 
    VALUES
      ('transport_fee_default', 'Default Transport Fee', 'transport_fee', 'fixed', 100, NULL, NULL),
      ('late_fee_default', 'Default Late Fee', 'late_fee', 'fixed', 200, NULL, NULL),
      ('exchange_penalty_within_5_days', 'Exchange Penalty (Within 5 Days)', 'exchange_penalty', 'percentage', 10, 0, 5),
      ('exchange_penalty_within_10_days', 'Exchange Penalty (6-10 Days)', 'exchange_penalty', 'percentage', 20, 6, 10),
      ('exchange_penalty_after_10_days', 'Exchange Penalty (After 10 Days)', 'exchange_penalty', 'percentage', 30, 11, NULL),
      ('cancellation_penalty_within_5_days', 'Cancellation Penalty (Within 5 Days)', 'cancellation_penalty', 'percentage', 10, 0, 5),
      ('cancellation_penalty_within_10_days', 'Cancellation Penalty (6-10 Days)', 'cancellation_penalty', 'percentage', 20, 6, 10),
      ('cancellation_penalty_after_10_days', 'Cancellation Penalty (After 10 Days)', 'cancellation_penalty', 'percentage', 30, 11, NULL)
    ON CONFLICT (policy_key) DO UPDATE SET is_active = true, value = EXCLUDED.value
  `);

  await testClient.end();

  console.log(`✅ Test database "${testDb}" ready (schema from "${prodDb}", clean data, policies seeded)`);
};
