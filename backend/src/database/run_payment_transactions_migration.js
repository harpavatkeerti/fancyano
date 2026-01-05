const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function createPaymentTransactionsTable() {
  try {
    console.log('Creating payment_transactions table...');
    
    const sqlPath = path.join(__dirname, 'create_payment_transactions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Payment transactions table created successfully!');
    console.log('Table includes: id, booking_id, amount, type, method, recorded_by, notes, created_at');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create payment_transactions table:', error);
    process.exit(1);
  }
}

createPaymentTransactionsTable();

