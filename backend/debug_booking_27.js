require('dotenv').config();
const pool = require('./src/database/connection');

async function debugBooking27() {
  try {
    // 1. Get booking status
    const booking = await pool.query(
      `SELECT id, status, booked_from, booked_to FROM bookings WHERE id = 27`
    );
    console.log('\n=== BOOKING 27 STATUS ===');
    console.log(JSON.stringify(booking.rows, null, 2));

    // 2. Get all booking products for booking 27
    const products = await pool.query(
      `SELECT bp.id, bp.product_id, bp.status, bp.booked_from, bp.booked_to, 
              bp.picked_up_at, bp.returned_at,
              p.name, p.code
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = 27`
    );
    console.log('\n=== BOOKING PRODUCTS ===');
    console.log(JSON.stringify(products.rows, null, 2));

    // 3. Check if the delayed query would pick this up
    const delayed = await pool.query(`
      SELECT
        bp.booking_id,
        bp.id as bp_id,
        b.status as booking_status,
        bp.status as product_status,
        bp.picked_up_at,
        bp.returned_at,
        bp.booked_to,
        bp.booked_to::date < CURRENT_DATE as is_past_due,
        CURRENT_DATE as today
      FROM booking_products bp
      JOIN bookings b ON bp.booking_id = b.id
      WHERE bp.booking_id = 27
    `);
    console.log('\n=== DELAYED CHECK DETAILS ===');
    console.log(JSON.stringify(delayed.rows, null, 2));

    // 4. Show which conditions fail
    for (const row of delayed.rows) {
      console.log(`\n--- Product BP ID ${row.bp_id} ---`);
      console.log(`  Booking status IN ('confirmed','in_progress'): ${['confirmed','in_progress'].includes(row.booking_status)} (actual: ${row.booking_status})`);
      console.log(`  picked_up_at IS NOT NULL: ${row.picked_up_at !== null} (actual: ${row.picked_up_at})`);
      console.log(`  returned_at IS NULL: ${row.returned_at === null} (actual: ${row.returned_at})`);
      console.log(`  booked_to < CURRENT_DATE: ${row.is_past_due} (booked_to: ${row.booked_to}, today: ${row.today})`);
      console.log(`  status NOT IN ('cancelled','exchanged','discarded','completed'): ${!['cancelled','exchanged','discarded','completed'].includes(row.product_status)} (actual: ${row.product_status})`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debugBooking27();
