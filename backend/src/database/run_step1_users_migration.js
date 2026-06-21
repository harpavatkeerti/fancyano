const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Step 1: Users as First-Class Entity — Schema Migration');
    console.log('──────────────────────────────────────────────────────────');

    // --- Part 1: Add phone columns + is_deleted to users ---
    const migration1 = path.join(__dirname, 'migrations', '024_add_phone_columns_to_users.sql');
    console.log('\n[1/2] Running 024_add_phone_columns_to_users.sql ...');
    const sql1 = fs.readFileSync(migration1, 'utf8');
    await client.query(sql1);
    console.log('  ✅ Users table extended (phone_country, alternate_phone, alternate_phone_country, is_deleted, UNIQUE phone)');

    // --- Part 2: Restructure bookings (TRUNCATE + user_id FK) ---
    const migration2 = path.join(__dirname, 'migrations', '025_restructure_bookings_for_user_fk.sql');
    console.log('\n[2/2] Running 025_restructure_bookings_for_user_fk.sql ...');
    const sql2 = fs.readFileSync(migration2, 'utf8');
    await client.query(sql2);
    console.log('  ✅ Bookings restructured (truncated, user_id FK added, customer_* columns dropped)');

    console.log('\n──────────────────────────────────────────────────────────');
    console.log('✅ Step 1 migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
