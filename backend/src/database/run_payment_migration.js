const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Starting payment columns migration...');
    
    const sqlPath = path.join(__dirname, 'add_payment_columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('Migration completed successfully!');
    console.log('Added columns: paid_amount, due_amount, payment_status');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

