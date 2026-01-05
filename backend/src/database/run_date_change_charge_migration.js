const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function addDateChangeChargeType() {
  try {
    console.log('Adding date_change_charge transaction type...');
    
    const sqlPath = path.join(__dirname, 'migrations', '011_add_date_change_charge_type.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Date change charge type added successfully!');
    console.log('Transaction types now include: payment, refund, adjustment, date_change_charge');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to add date_change_charge type:', error);
    process.exit(1);
  }
}

addDateChangeChargeType();

