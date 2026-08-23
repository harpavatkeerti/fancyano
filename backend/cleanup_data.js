/**
 * Cleanup Script: Wipe all data (products, bookings, inventory, vendors, customers)
 * while KEEPING admin & salesman users intact.
 * Also resets all serial sequences so IDs start fresh from 1.
 */
require('dotenv').config();
const pool = require('./src/database/connection');

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('=== CLEANUP: Starting full data wipe ===\n');

    // 1. Show what we're keeping (admin & salesman users)
    const { rows: keepUsers } = await client.query(
      `SELECT id, name, role, username FROM users WHERE role IN ('admin', 'salesman') ORDER BY id`
    );
    console.log('Users to KEEP (admin & salesman):');
    keepUsers.forEach(u => console.log(`  [${u.id}] ${u.name} (${u.role}) - username: ${u.username}`));
    console.log();

    // 2. Delete data in proper order (child tables first to respect foreign keys)
    const deletions = [
      // Booking-related child tables
      { table: 'booking_activity_log',         desc: 'Activity logs' },
      { table: 'booking_cancellation_history',  desc: 'Cancellation history' },
      { table: 'booking_exchange_history',      desc: 'Exchange history' },
      { table: 'product_charges',              desc: 'Product charges' },
      { table: 'payment_transactions',         desc: 'Payment transactions' },
      { table: 'complaint_notes',              desc: 'Complaint notes' },
      { table: 'product_tracking',             desc: 'Product tracking' },
      // Older tables (may or may not exist)
      { table: 'booking_cancellations',        desc: 'Old booking cancellations', optional: true },
      { table: 'product_exchanges',            desc: 'Old product exchanges', optional: true },
      // Junction / dependent tables
      { table: 'booking_products',             desc: 'Booking products' },
      { table: 'complaints',                   desc: 'Complaints' },
      { table: 'feedback',                     desc: 'Feedback' },
      // Main tables
      { table: 'bookings',                     desc: 'Bookings' },
      { table: 'products',                     desc: 'Products' },
      { table: 'vendors',                      desc: 'Vendors' },
      // Users - only delete customers
      { table: 'users', where: `role = 'customer'`, desc: 'Customer users' },
    ];

    for (const { table, desc, where, optional } of deletions) {
      try {
        if (optional) {
          // Use savepoint so a missing table doesn't kill the transaction
          await client.query(`SAVEPOINT sp_${table}`);
        }
        const condition = where ? `WHERE ${where}` : '';
        const result = await client.query(`DELETE FROM ${table} ${condition}`);
        console.log(`✓ Deleted ${result.rowCount} rows from ${table} (${desc})`);
        if (optional) {
          await client.query(`RELEASE SAVEPOINT sp_${table}`);
        }
      } catch (err) {
        if (optional && err.code === '42P01') {
          // Table doesn't exist — roll back to savepoint and continue
          await client.query(`ROLLBACK TO SAVEPOINT sp_${table}`);
          console.log(`⊘ Skipped ${table} (table does not exist)`);
        } else {
          throw err;
        }
      }
    }

    console.log();

    // 3. Reset sequences so IDs start from 1 again
    const sequenceTables = [
      'booking_activity_log', 'booking_cancellation_history', 'booking_exchange_history',
      'product_charges', 'payment_transactions', 'complaint_notes', 'product_tracking',
      'booking_products', 'complaints', 'feedback',
      'bookings', 'products', 'vendors',
    ];

    console.log('Resetting ID sequences...');
    for (const table of sequenceTables) {
      try {
        await client.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`);
        console.log(`  ✓ Reset ${table}_id_seq`);
      } catch (err) {
        if (err.code === '42P01') {
          console.log(`  ⊘ Skipped ${table}_id_seq (does not exist)`);
        } else {
          throw err;
        }
      }
    }

    console.log();

    // 4. Show remaining data summary
    const { rows: remainingUsers } = await client.query(
      `SELECT id, name, role, username FROM users ORDER BY id`
    );
    console.log(`Remaining users: ${remainingUsers.length}`);
    remainingUsers.forEach(u => console.log(`  [${u.id}] ${u.name} (${u.role})`));

    await client.query('COMMIT');
    console.log('\n=== CLEANUP COMPLETE ===');
    console.log('All products, bookings, inventory, vendors, and customer data have been wiped.');
    console.log('Admin & salesman users are preserved.');
    console.log('\nDon\'t forget: product/invoice/profile images in storage/uploads/ should also be cleared.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ CLEANUP FAILED — all changes rolled back');
    console.error(err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanup();
