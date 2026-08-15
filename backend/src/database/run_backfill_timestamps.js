require('dotenv').config();
const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, 'migrations', '030_backfill_pickup_return_timestamps.sql'),
      'utf8'
    );
    const result = await pool.query(sql);
    console.log('✅ Backfill migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

run();
