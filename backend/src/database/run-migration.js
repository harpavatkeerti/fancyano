const pool = require('./connection');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const migrations = [
      'add_alternate_phone.sql',
      'add_gender_size.sql',
      'add_purchase_price.sql',
      'add_product_image.sql',
      'add_rental_policy.sql',
      'add_booking_payment_requirements.sql',
      'create_settings_table.sql',
      '008_product_tracking.sql',
      '035_drop_gender_column.sql'
    ];

    for (const migration of migrations) {
      console.log(`Running migration: ${migration}`);
      
      const migrationPath = path.join(__dirname, 'migrations', migration);
      
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await pool.query(sql);
        console.log(`✅ ${migration} completed successfully!`);
      } else {
        console.log(`⚠️  ${migration} not found, skipping...`);
      }
    }
    
    console.log('✅ All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

