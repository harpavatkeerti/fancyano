const pool = require('./src/database/connection');

async function verifyMigration() {
  console.log('🔍 Verifying migration...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  const test = (name, passed, details = '') => {
    results.tests.push({ name, passed, details });
    if (passed) {
      console.log(`✅ ${name}`);
      results.passed++;
    } else {
      console.log(`❌ ${name}`);
      if (details) console.log(`   ${details}`);
      results.failed++;
    }
  };

  try {
    // Test 1: Check new tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('product_charges', 'booking_exchange_history', 
                         'booking_cancellation_history', 'rental_policies', 
                         'booking_activity_log')
      ORDER BY table_name
    `);
    test('New tables created', tables.rows.length === 5, 
      `Found ${tables.rows.length}/5 tables: ${tables.rows.map(r => r.table_name).join(', ')}`);

    // Test 2: Check bookings table columns
    const bookingsColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      AND column_name IN ('transport_charge', 'transport_paid', 'final_discount', 'overpayment', 'customer_email')
    `);
    test('Bookings table: new columns added', bookingsColumns.rows.length === 5,
      `Found ${bookingsColumns.rows.length}/5 columns`);

    // Test 3: Check booking_products table columns
    const bpColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'booking_products' 
      AND column_name IN ('status', 'rent', 'security_deposit', 'discount_amount', 'discount_type', 
                          'effective_rent', 'picked_up_at', 'returned_at', 'exchanged_at', 
                          'cancelled_at', 'measurements', 'updated_at')
    `);
    test('Booking_products table: new columns added', bpColumns.rows.length === 12,
      `Found ${bpColumns.rows.length}/12 columns`);

    // Test 4: Check status constraint exists and values migrated
    const statusCheck = await pool.query(`
      SELECT COUNT(*) as count FROM booking_products 
      WHERE status NOT IN ('pending', 'confirmed', 'in_progress', 'completed', 'exchanged', 'cancelled')
    `);
    test('Status values migrated correctly', parseInt(statusCheck.rows[0].count) === 0,
      statusCheck.rows[0].count > 0 ? `${statusCheck.rows[0].count} invalid status values found` : 'All status values valid');

    // Test 5: Check payment_transactions has transaction_date
    const ptColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'payment_transactions' 
      AND column_name IN ('transaction_date', 'charge_category')
    `);
    test('Payment_transactions: transaction_date and charge_category exist', 
      ptColumns.rows.length === 2,
      `Found ${ptColumns.rows.length}/2 columns`);

    // Test 6: Check constraints exist
    const constraints = await pool.query(`
      SELECT constraint_name FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
      AND constraint_type = 'CHECK'
      AND constraint_name IN ('chk_overpayment', 'chk_transport_paid', 'chk_product_status', 
                              'chk_product_dates', 'chk_rent_values', 'chk_product_discount')
    `);
    test('Check constraints created', constraints.rows.length === 6,
      `Found ${constraints.rows.length}/6 constraints`);

    // Test 7: Check default policies inserted
    const policies = await pool.query(`
      SELECT COUNT(*) as count FROM rental_policies 
      WHERE policy_key IN ('transport_fee_default', 'late_fee_default', 
                          'exchange_penalty_within_5_days', 'exchange_penalty_within_10_days',
                          'exchange_penalty_after_10_days', 'cancellation_penalty_within_5_days',
                          'cancellation_penalty_within_10_days', 'cancellation_penalty_after_10_days')
    `);
    test('Default policies inserted', parseInt(policies.rows[0].count) === 8,
      `Found ${policies.rows[0].count}/8 policies`);

    // Test 8: Check indexes created
    const indexes = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname IN ('idx_bookings_customer_email', 'idx_product_availability',
                       'idx_product_charges_lookup', 'idx_booking_transactions',
                       'idx_policy_key', 'idx_booking_activity')
    `);
    test('Indexes created', indexes.rows.length === 6,
      `Found ${indexes.rows.length}/6 sample indexes`);

    // Test 9: Check product_charges table structure
    const pcCheck = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'product_charges' 
      AND column_name IN ('booking_product_id', 'charge_type', 'due_amount', 'paid_amount')
    `);
    test('Product_charges table: correct structure', pcCheck.rows.length === 4,
      `Found ${pcCheck.rows.length}/4 key columns`);

    // Test 10: Check booking_activity_log foreign keys
    const activityLogFKs = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'booking_activity_log' 
      AND column_name IN ('exchange_history_id', 'cancellation_history_id', 'payment_transaction_id')
    `);
    test('Booking_activity_log: foreign key columns exist', activityLogFKs.rows.length === 3,
      `Found ${activityLogFKs.rows.length}/3 FK columns`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`Total: ${results.tests.length} tests`);
    console.log('='.repeat(50));

    if (results.failed === 0) {
      console.log('\n🎉 All migration verifications passed!');
    } else {
      console.log('\n⚠️  Some verifications failed. Please review.');
    }

  } catch (error) {
    console.error('\n❌ Verification error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }

  return results.failed === 0;
}

if (require.main === module) {
  verifyMigration()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Verification failed:', error);
      process.exit(1);
    });
}

module.exports = { verifyMigration };
