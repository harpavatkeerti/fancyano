const pool = require('./src/database/connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('📊 Running migration: Add status to booking_products...');
    
    const migrationPath = path.join(__dirname, 'migrations', '008_add_status_to_booking_products.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the changes
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'booking_products' AND column_name = 'status'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Status column added:', result.rows[0]);
    }
    
    // Check existing data
    const countResult = await client.query(`
      SELECT status, COUNT(*) as count 
      FROM booking_products 
      GROUP BY status
    `);
    
    console.log('📊 Current status distribution:', countResult.rows);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();

