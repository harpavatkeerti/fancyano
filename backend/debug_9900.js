const { Pool } = require('pg');
const pool = new Pool({host:'localhost',port:5432,database:'rental_db',user:'postgres',password:'1234'});

async function debug() {
  try {
    // 1. Booking details
    const booking = await pool.query('SELECT id, status, transport_charge, transport_paid, final_discount, overpayment FROM bookings WHERE id = 9900');
    console.log('=== BOOKING ===');
    console.log(JSON.stringify(booking.rows, null, 2));

    // 2. Booking products
    const products = await pool.query('SELECT id, product_id, status, rent, security_deposit, effective_rent FROM booking_products WHERE booking_id = 9900');
    console.log('\n=== PRODUCTS ===');
    console.log(JSON.stringify(products.rows, null, 2));

    // 3. Product charges
    const charges = await pool.query(`
      SELECT pc.*, bp.product_id, bp.status as product_status
      FROM product_charges pc
      JOIN booking_products bp ON pc.booking_product_id = bp.id
      WHERE bp.booking_id = 9900
      ORDER BY bp.id, pc.charge_type
    `);
    console.log('\n=== CHARGES ===');
    console.log(JSON.stringify(charges.rows, null, 2));

    // 4. Payment transactions
    const transactions = await pool.query('SELECT id, type, amount, method, notes, transaction_date FROM payment_transactions WHERE booking_id = 9900 ORDER BY transaction_date');
    console.log('\n=== TRANSACTIONS ===');
    console.log(JSON.stringify(transactions.rows, null, 2));

  } catch (e) {
    console.error(e.message);
  } finally {
    await pool.end();
  }
}

debug();
