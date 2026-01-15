const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// GET all exchanges for a booking
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        pe.*,
        op.name as original_product_name,
        op.code as original_product_code,
        ep.name as exchanged_product_name,
        ep.code as exchanged_product_code
      FROM product_exchanges pe
      LEFT JOIN products op ON pe.original_product_id = op.id
      LEFT JOIN products ep ON pe.exchanged_product_id = ep.id
      WHERE pe.booking_id = $1
      ORDER BY pe.created_at DESC`,
      [bookingId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching exchanges:', error);
    res.status(500).json({ error: 'Failed to fetch exchanges' });
  }
});

// POST create exchange
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      booking_id,
      original_product_id,
      exchanged_product_id,
      exchange_date,
      reason,
      exchanged_by,
      booked_from,
      booked_to
    } = req.body;
    
    if (!booking_id || !original_product_id || !exchanged_product_id) {
      return res.status(400).json({ error: 'Booking ID, original product ID, and exchanged product ID are required' });
    }
    
    // Fetch booking details
    const bookingResult = await client.query(
      'SELECT booking_date, booked_from, booked_to, total_amount FROM bookings WHERE id = $1',
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    const bookingDate = new Date(booking.booking_date);
    const exchangeDateObj = exchange_date ? new Date(exchange_date) : new Date();
    
    // Calculate days from booking date
    const daysDiff = Math.floor((exchangeDateObj - bookingDate) / (1000 * 60 * 60 * 24));
    
    // Fetch exchange policy
    let exchangePolicy = null;
    try {
      const policyResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['refund_policy']
      );
      if (policyResult.rows.length > 0) {
        exchangePolicy = JSON.parse(policyResult.rows[0].setting_value);
      }
    } catch (error) {
      console.error('Error fetching exchange policy:', error);
    }
    
    // Calculate penalty percentage based on exchange policy
    let penaltyPercentage = 0;
    if (exchangePolicy && exchangePolicy.days) {
      const days = exchangePolicy.days;
      const penalties = [
        exchangePolicy.before_7_days || 0,    // Row 1 penalty
        exchangePolicy.before_3_days || 0,    // Row 2 penalty
        exchangePolicy.before_1_day || 0,     // Row 3 penalty
        exchangePolicy.on_booking_date || 0   // Row 4 penalty (after last threshold)
      ];
      
      if (daysDiff <= days[0]) {
        penaltyPercentage = penalties[0];
      } else if (daysDiff <= days[1]) {
        penaltyPercentage = penalties[1];
      } else if (daysDiff <= days[2]) {
        penaltyPercentage = penalties[2];
      } else {
        penaltyPercentage = penalties[3];
      }
    }
    
    // Fetch rent difference setting from settings (currently stored as 'exchange_charges' for backward compatibility)
    let rentDiff = 0;
    try {
      const chargeResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['exchange_charges']
      );
      if (chargeResult.rows.length > 0) {
        rentDiff = parseFloat(chargeResult.rows[0].setting_value) || 0;
      }
    } catch (error) {
      console.error('Error fetching rent diff setting:', error);
    }
    
    // Fetch original product to get rent per day
    const productResult = await client.query(
      'SELECT rent_per_day FROM products WHERE id = $1',
      [original_product_id]
    );
    
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Original product not found' });
    }
    
    const rentPerDay = parseFloat(productResult.rows[0].rent_per_day) || 0;
    
    // Calculate total charge: (rent_per_day * penalty_percentage / 100) + rent_diff
    const penaltyCharge = (rentPerDay * penaltyPercentage) / 100;
    const totalCharge = penaltyCharge + rentDiff;
    
    // Insert exchange record
    const exchangeResult = await client.query(
      `INSERT INTO product_exchanges 
       (booking_id, original_product_id, exchanged_product_id, exchange_date, days_from_booking, 
        penalty_percentage, rent_diff, total_charge, reason, exchanged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        booking_id,
        original_product_id,
        exchanged_product_id,
        exchange_date || new Date().toISOString().split('T')[0],
        daysDiff,
        penaltyPercentage,
        rentDiff,
        totalCharge,
        reason || null,
        exchanged_by || null
      ]
    );
    
    // Get original and exchanged product details
    const originalProductResult = await client.query(
      `SELECT p.rent_per_day, p.security_deposit, p.name, p.code, bp.booked_from, bp.booked_to 
       FROM products p
       JOIN booking_products bp ON bp.product_id = p.id
       WHERE bp.booking_id = $1 AND p.id = $2`,
      [booking_id, original_product_id]
    );
    
    if (originalProductResult.rows.length === 0) {
      throw new Error('Original product not found in booking');
    }
    
    const exchangedProductResult = await client.query(
      'SELECT rent_per_day, security_deposit, name, code FROM products WHERE id = $1',
      [exchanged_product_id]
    );
    
    if (exchangedProductResult.rows.length === 0) {
      throw new Error('Exchanged product not found');
    }
    
    const originalProduct = originalProductResult.rows[0];
    const exchangedProduct = exchangedProductResult.rows[0];
    
    // Get original product dates (to unblock later - dates are automatically unblocked when removed from booking_products)
    const originalBookedFrom = originalProduct.booked_from || booking.booked_from || null;
    const originalBookedTo = originalProduct.booked_to || booking.booked_to || null;
    
    // Use provided dates or fallback to original dates
    const newBookedFrom = booked_from || originalBookedFrom;
    const newBookedTo = booked_to || originalBookedTo;
    
    if (!newBookedFrom || !newBookedTo) {
      throw new Error('Dates are required for exchange');
    }
    
    // Update booking_products: remove original (this unblocks the original dates), add exchanged with new dates (this blocks new dates)
    await client.query(
      'DELETE FROM booking_products WHERE booking_id = $1 AND product_id = $2',
      [booking_id, original_product_id]
    );
    
    await client.query(
      'INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to) VALUES ($1, $2, $3, $4)',
      [booking_id, exchanged_product_id, newBookedFrom, newBookedTo]
    );
    
    // Recalculate booking total_amount and security_deposit as sum of all products
    const recalcResult = await client.query(
      `SELECT 
        COALESCE(SUM(p.rent_per_day), 0) as total_rent,
        COALESCE(SUM(p.security_deposit), 0) as total_security,
        MIN(bp.booked_from) as min_booked_from,
        MAX(bp.booked_to) as max_booked_to
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1`,
      [booking_id]
    );
    
    const newTotalRent = parseFloat(recalcResult.rows[0].total_rent) || 0;
    const newTotalSecurity = parseFloat(recalcResult.rows[0].total_security) || 0;
    const minBookedFrom = recalcResult.rows[0].min_booked_from;
    const maxBookedTo = recalcResult.rows[0].max_booked_to;
    
    // Get current other_charges (transportation, etc.) - these should NOT be reset
    // ALSO get current total_amount BEFORE exchange (for downgrade detection)
    const bookingChargesResult = await client.query(
      `SELECT COALESCE(other_charges, 0) as other_charges, 
              COALESCE(total_amount, 0) as old_total_amount, 
              COALESCE(paid_amount, 0) as paid_amount,
              discount_type, discount_value, discount_amount 
       FROM bookings WHERE id = $1`,
      [booking_id]
    );
    const otherCharges = parseFloat(bookingChargesResult.rows[0].other_charges) || 0;
    const oldTotalAmount = parseFloat(bookingChargesResult.rows[0].old_total_amount) || 0;
    const currentPaidAmount = parseFloat(bookingChargesResult.rows[0].paid_amount) || 0;
    const hasDiscount = bookingChargesResult.rows[0].discount_type && parseFloat(bookingChargesResult.rows[0].discount_value) > 0;
    
    // total_amount = sum of products' rent + other_charges (transportation, etc.)
    // security_deposit = sum of products' security deposits ONLY (not affected by transportation)
    // NOTE: Exchange uses BEFORE-DISCOUNT product rents for calculation
    // Any existing discount is REMOVED during exchange (similar to partial cancellation)
    const newTotalAmount = newTotalRent + otherCharges;
    
    if (hasDiscount) {
      console.log(`🔄 DISCOUNT REMOVAL (Product Exchange):`);
      console.log(`  Original Discount: ${bookingChargesResult.rows[0].discount_type} ${bookingChargesResult.rows[0].discount_value}${bookingChargesResult.rows[0].discount_type === 'percentage' ? '%' : ''} = ₹${bookingChargesResult.rows[0].discount_amount}`);
      console.log(`  New Products Rent: ₹${newTotalRent}`);
      console.log(`  Transportation: ₹${otherCharges}`);
      console.log(`  New Total (without discount): ₹${newTotalAmount}`);
      console.log(`  Note: Discount removed due to product exchange`);
    }
    
    // Update booking with recalculated totals AND booking dates (min start date and max end date)
    // IMPORTANT: total_amount includes other_charges, but security_deposit does NOT
    // Remove discount during exchange
    await client.query(
      `UPDATE bookings 
       SET total_amount = $1,
           security_deposit = $2,
           booked_from = $3,
           booked_to = $4,
           discount_type = NULL,
           discount_value = 0,
           discount_amount = 0,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $5`,
      [newTotalAmount, newTotalSecurity, minBookedFrom, maxBookedTo, booking_id]
    );
    
    const originalProductName = originalProduct.name || `Product ${original_product_id}`;
    const exchangedProductName = exchangedProduct.name || `Product ${exchanged_product_id}`;
    
    // AUTOMATIC PENALTY RECORDING FOR DOWNGRADES
    // When user has already paid and exchanges to a cheaper product:
    // The "overpayment" should be allocated to penalties, not security deposit
    
    // Calculate if this is a downgrade (new total rent < old total rent)
    // Note: oldTotalAmount includes other_charges, so we need to subtract it for fair comparison
    const oldTotalRent = oldTotalAmount - otherCharges;
    const isDowngrade = newTotalRent < oldTotalRent;
    
    // Calculate the ACTUAL rent difference for downgrade penalty (not the settings value)
    const actualRentDifference = oldTotalRent - newTotalRent;
    // Downgrade penalty = rent difference minus exchange penalty
    const actualDowngradePenalty = Math.max(0, actualRentDifference - penaltyCharge);
    
    // If user has paid more than the new rent, AND this is a downgrade, record penalties automatically
    if (isDowngrade && currentPaidAmount >= oldTotalRent) {
      console.log('🔄 AUTOMATIC PENALTY RECORDING (Downgrade with overpayment):');
      console.log(`  Old Total Rent: ₹${oldTotalRent}`);
      console.log(`  New Total Rent: ₹${newTotalRent}`);
      console.log(`  Actual Rent Difference: ₹${actualRentDifference}`);
      console.log(`  Current Paid: ₹${currentPaidAmount}`);
      console.log(`  Penalty Percentage: ${penaltyPercentage}%`);
      console.log(`  Exchange Penalty Charge: ₹${penaltyCharge}`);
      console.log(`  Downgrade Penalty (Difference - Exchange): ₹${actualDowngradePenalty}`);
      
      // Create exchange penalty transaction (already paid from original payment)
      if (penaltyCharge > 0) {
        const penaltyNotes = `Exchange Penalty: ${originalProductName} → ${exchangedProductName} (${penaltyPercentage}% penalty) [Auto-recorded from overpayment]`;
        
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, transaction_type, method, notes, recorded_by)
           VALUES ($1, $2, 'payment', 'exchange_penalty', $3, $4, $5)`,
          [
            booking_id,
            penaltyCharge,
            'Adjustment', // Method is "Adjustment" since it's from existing payment
            penaltyNotes,
            exchanged_by || 'system'
          ]
        );
        console.log(`  ✅ Created exchange_penalty transaction: ₹${penaltyCharge}`);
      }
      
      // Create downgrade penalty transaction (already paid from original payment)
      if (actualDowngradePenalty > 0) {
        const downgradePenaltyNotes = `Downgrade Penalty: ${originalProductName} → ${exchangedProductName} (Rent difference charge) [Auto-recorded from overpayment]`;
        
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, transaction_type, method, notes, recorded_by)
           VALUES ($1, $2, 'payment', 'downgrade_penalty', $3, $4, $5)`,
          [
            booking_id,
            actualDowngradePenalty,
            'Adjustment', // Method is "Adjustment" since it's from existing payment
            downgradePenaltyNotes,
            exchanged_by || 'system'
          ]
        );
        console.log(`  ✅ Created downgrade_penalty transaction: ₹${actualDowngradePenalty}`);
      }
      
      console.log('  Note: These penalties are allocated from the original payment');
      console.log('  The overpayment does NOT go toward security deposit');
    }
    
    // IMPORTANT: We do NOT create automatic refunds during exchange because:
    // 1. The frontend validates that total new rent (including additional products) >= old rent before allowing exchange
    // 2. If exchange is allowed, it means customer needs to pay rent difference (not get a refund)
    // 3. Any refunds should be manually recorded by admin/salesman if needed
    
    await client.query('COMMIT');
    
    // Fetch complete exchange with product names
    const completeExchange = await pool.query(
      `SELECT 
        pe.*,
        op.name as original_product_name,
        op.code as original_product_code,
        ep.name as exchanged_product_name,
        ep.code as exchanged_product_code
      FROM product_exchanges pe
      LEFT JOIN products op ON pe.original_product_id = op.id
      LEFT JOIN products ep ON pe.exchanged_product_id = ep.id
      WHERE pe.id = $1`,
      [exchangeResult.rows[0].id]
    );
    
    // Return exchange data
    // Note: Rent difference is calculated by frontend based on new total rent vs old rent
    res.status(201).json(completeExchange.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating exchange:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create exchange', details: error.message });
  } finally {
    client.release();
  }
});

// POST record payment for exchange penalty
router.post('/:id/payment', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { amount, payment_method, recorded_by, narration } = req.body;
    
    if (!amount || amount <= 0 || !payment_method) {
      return res.status(400).json({ error: 'Valid amount (> 0) and payment method are required' });
    }
    
    // Fetch exchange details
    const exchangeResult = await client.query(
      `SELECT 
        pe.*,
        op.name as original_product_name,
        ep.name as exchanged_product_name
      FROM product_exchanges pe
      LEFT JOIN products op ON pe.original_product_id = op.id
      LEFT JOIN products ep ON pe.exchanged_product_id = ep.id
      WHERE pe.id = $1`,
      [id]
    );
    
    if (exchangeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }
    
    const exchange = exchangeResult.rows[0];
    
    // Check if payment already recorded
    const existingPayment = await client.query(
      `SELECT id FROM payment_transactions 
       WHERE booking_id = $1 
       AND transaction_type = 'exchange_penalty' 
       AND notes LIKE $2`,
      [exchange.booking_id, `%Exchange Penalty: ${exchange.original_product_name} → ${exchange.exchanged_product_name}%`]
    );
    
    if (existingPayment.rows.length > 0) {
      return res.status(400).json({ error: 'Payment already recorded for this exchange' });
    }
    
    // Calculate the penalty charge (excluding rent_diff)
    const rentPerDayResult = await client.query(
      'SELECT rent_per_day FROM products WHERE id = $1',
      [exchange.original_product_id]
    );
    const rentPerDay = parseFloat(rentPerDayResult.rows[0].rent_per_day) || 0;
    const penaltyCharge = (rentPerDay * exchange.penalty_percentage) / 100;
    const rentDiffAmount = parseFloat(exchange.rent_diff) || 0;
    
    // Create payment transaction for exchange penalty (percentage-based penalty only)
    // Store actual payment method and use transaction_type for categorization
    const notesText = `Exchange Penalty: ${exchange.original_product_name} → ${exchange.exchanged_product_name} (${exchange.penalty_percentage}% penalty)${narration ? ` | Narration: ${narration}` : ''}`;
    
    await client.query(
      `INSERT INTO payment_transactions 
       (booking_id, amount, type, transaction_type, method, notes, recorded_by)
       VALUES ($1, $2, 'payment', 'exchange_penalty', $3, $4, $5)`,
      [
        exchange.booking_id,
        penaltyCharge,
        payment_method,
        notesText,
        recorded_by || 'system'
      ]
    );
    
    // Create separate transaction for rent_diff (downgrade penalty) if it exists
    if (rentDiffAmount > 0) {
      const rentDiffNotes = `Downgrade Penalty: ${exchange.original_product_name} → ${exchange.exchanged_product_name} (Rent difference charge)${narration ? ` | Narration: ${narration}` : ''}`;
      
      await client.query(
        `INSERT INTO payment_transactions 
         (booking_id, amount, type, transaction_type, method, notes, recorded_by)
         VALUES ($1, $2, 'payment', 'downgrade_penalty', $3, $4, $5)`,
        [
          exchange.booking_id,
          rentDiffAmount,
          payment_method,
          rentDiffNotes,
          recorded_by || 'system'
        ]
      );
    }
    
    await client.query('COMMIT');
    
    res.json({ message: 'Payment recorded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    client.release();
  }
});

// POST record payment for rent difference (when product is upgraded)
router.post('/:id/rent-payment', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { amount, payment_method, recorded_by, narration } = req.body;
    
    if (!amount || amount <= 0 || !payment_method) {
      return res.status(400).json({ error: 'Valid amount (> 0) and payment method are required' });
    }
    
    // Fetch exchange details
    const exchangeResult = await client.query(
      `SELECT 
        pe.*,
        op.name as original_product_name,
        ep.name as exchanged_product_name
      FROM product_exchanges pe
      LEFT JOIN products op ON pe.original_product_id = op.id
      LEFT JOIN products ep ON pe.exchanged_product_id = ep.id
      WHERE pe.id = $1`,
      [id]
    );
    
    if (exchangeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }
    
    const exchange = exchangeResult.rows[0];
    
    // Calculate rent difference including all products in the booking
    // Get original product rent
    const originalProductResult = await client.query(
      'SELECT rent_per_day FROM products WHERE id = $1',
      [exchange.original_product_id]
    );
    
    if (originalProductResult.rows.length === 0) {
      return res.status(404).json({ error: 'Original product not found' });
    }
    
    const oldRent = parseFloat(originalProductResult.rows[0].rent_per_day) || 0;
    
    // Get current total rent of all products in the booking (after exchange)
    const currentBookingRentResult = await client.query(
      `SELECT COALESCE(SUM(p.rent_per_day), 0) as total_rent
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1`,
      [exchange.booking_id]
    );
    
    const currentTotalRent = parseFloat(currentBookingRentResult.rows[0].total_rent) || 0;
    
    // Rent difference is the difference between current total rent and original product rent
    // This accounts for additional products that may have been added during exchange
    const rentDifference = currentTotalRent - oldRent;
    
    // Validate that amount is positive (frontend calculates the exact amount to collect)
    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }
    
    // Log for debugging
    console.log('💰 Rent difference payment:', {
      currentTotalRent,
      oldRent,
      calculatedDifference: rentDifference,
      amountReceived: amountNum
    });
    
    // Check if payment already recorded
    const existingPayment = await client.query(
      `SELECT id FROM payment_transactions 
       WHERE booking_id = $1 
       AND transaction_type = 'exchange_upgrade' 
       AND notes LIKE $2`,
      [exchange.booking_id, `%Additional Rent: ${exchange.original_product_name} → ${exchange.exchanged_product_name}%`]
    );
    
    if (existingPayment.rows.length > 0) {
      return res.status(400).json({ error: 'Rent difference payment already recorded for this exchange' });
    }
    
    // Create payment transaction for rent difference
    const notesText = `Additional Rent: ${exchange.original_product_name} → ${exchange.exchanged_product_name} (₹${rentDifference} difference)${narration ? ` | Narration: ${narration}` : ''}`;
    
    await client.query(
      `INSERT INTO payment_transactions 
       (booking_id, amount, type, transaction_type, method, notes, recorded_by)
       VALUES ($1, $2, 'payment', 'exchange_upgrade', $3, $4, $5)`,
      [
        exchange.booking_id,
        parseFloat(amount),
        payment_method,
        notesText,
        recorded_by || 'system'
      ]
    );
    
    // Update booking paid_amount (rent difference is a payment, not a penalty)
    await client.query(
      `UPDATE bookings 
       SET paid_amount = COALESCE(paid_amount, 0) + $1,
           due_amount = total_amount - (COALESCE(paid_amount, 0) + $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [parseFloat(amount), exchange.booking_id]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: 'Rent difference payment recorded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording rent payment:', error);
    res.status(500).json({ error: 'Failed to record rent payment' });
  } finally {
    client.release();
  }
});

// DELETE exchange
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         EXCHANGE DELETION - COMPLETE AUDIT LOG               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log(`\n🔍 Exchange ID: ${id}\n`);
    
    // Fetch exchange details with product names
    const exchangeResult = await client.query(
      `SELECT 
        pe.*,
        op.name as original_product_name,
        op.code as original_product_code,
        op.rent_per_day as original_rent,
        op.security_deposit as original_security,
        ep.name as exchanged_product_name,
        ep.code as exchanged_product_code,
        ep.rent_per_day as exchanged_rent,
        ep.security_deposit as exchanged_security
      FROM product_exchanges pe
      LEFT JOIN products op ON pe.original_product_id = op.id
      LEFT JOIN products ep ON pe.exchanged_product_id = ep.id
      WHERE pe.id = $1`,
      [id]
    );
    
    if (exchangeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }
    
    const exchange = exchangeResult.rows[0];
    
    console.log('📋 EXCHANGE DETAILS:');
    console.log('  Original Product:', exchange.original_product_name, `(${exchange.original_product_code})`);
    console.log('  Original Rent:', `₹${exchange.original_rent}`);
    console.log('  Original Security:', `₹${exchange.original_security}`);
    console.log('  Exchanged To:', exchange.exchanged_product_name, `(${exchange.exchanged_product_code})`);
    console.log('  Exchanged Rent:', `₹${exchange.exchanged_rent}`);
    console.log('  Exchanged Security:', `₹${exchange.exchanged_security}`);
    console.log('  Reason:', exchange.reason);
    console.log('');
    
    // Get current booking state BEFORE deletion
    const bookingBefore = await client.query(
      `SELECT total_amount, security_deposit, paid_amount
       FROM bookings
       WHERE id = $1`,
      [exchange.booking_id]
    );
    
    console.log('📊 BOOKING STATE **BEFORE** DELETION:');
    console.log('  Total Rent:', `₹${bookingBefore.rows[0].total_amount}`);
    console.log('  Total Security:', `₹${bookingBefore.rows[0].security_deposit}`);
    console.log('  Paid Amount:', `₹${bookingBefore.rows[0].paid_amount || 0}`);
    console.log('');
    
    // Get all products BEFORE deletion
    const productsBefore = await client.query(
      `SELECT bp.product_id, p.code, p.name, p.rent_per_day, p.security_deposit
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1
       ORDER BY p.name`,
      [exchange.booking_id]
    );
    
    console.log('📦 PRODUCTS **BEFORE** DELETION:');
    productsBefore.rows.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name} (${p.code}) - Rent: ₹${p.rent_per_day}, Security: ₹${p.security_deposit}`);
    });
    console.log('  Total Products:', productsBefore.rows.length);
    console.log('');
    
    // Get all transactions BEFORE deletion
    const transactionsBefore = await client.query(
      `SELECT id, amount, type, method, notes
       FROM payment_transactions
       WHERE booking_id = $1
       ORDER BY created_at`,
      [exchange.booking_id]
    );
    
    console.log('💰 TRANSACTIONS **BEFORE** DELETION:');
    transactionsBefore.rows.forEach((t, idx) => {
      console.log(`  ${idx + 1}. ID: ${t.id}, Amount: ₹${t.amount}, Type: ${t.type}, Method: ${t.method}`);
      if (t.notes) console.log(`     Notes: ${t.notes.substring(0, 100)}`);
    });
    console.log('  Total Transactions:', transactionsBefore.rows.length);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    STARTING DELETION                          ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Get booking details for fallback dates
    const bookingResult = await client.query(
      'SELECT booked_from, booked_to FROM bookings WHERE id = $1',
      [exchange.booking_id]
    );
    const booking = bookingResult.rows[0];
    
    // Get original product details to restore its dates
    const originalProductResult = await client.query(
      `SELECT p.rent_per_day, p.security_deposit, bp.booked_from, bp.booked_to 
       FROM products p
       LEFT JOIN booking_products bp ON bp.product_id = p.id AND bp.booking_id = $1
       WHERE p.id = $2`,
      [exchange.booking_id, exchange.original_product_id]
    );
    
    // Get the original product's dates from before the exchange
    // If we can't find it in booking_products, use booking-level dates
    let bookedFrom = booking.booked_from;
    let bookedTo = booking.booked_to;
    
    // Try to get dates from the original product if it exists in a previous exchange record
    // Otherwise, use booking dates
    const originalDatesResult = await client.query(
      `SELECT bp.booked_from, bp.booked_to 
       FROM booking_products bp
       WHERE bp.booking_id = $1 AND bp.product_id = $2
       LIMIT 1`,
      [exchange.booking_id, exchange.original_product_id]
    );
    
    // If original product is still in booking (shouldn't happen, but handle it)
    if (originalDatesResult.rows.length > 0) {
      bookedFrom = originalDatesResult.rows[0].booked_from || booking.booked_from;
      bookedTo = originalDatesResult.rows[0].booked_to || booking.booked_to;
    }
    
    // IMPORTANT: Remove ONLY the exchanged product from the booking
    // This keeps all other products intact (e.g., if there were multiple products before the exchange)
    // Then restore the original product
    const deleteProductResult = await client.query(
      'DELETE FROM booking_products WHERE booking_id = $1 AND product_id = $2 RETURNING product_id',
      [exchange.booking_id, exchange.exchanged_product_id]
    );
    
    console.log(`✅ Deleted ${deleteProductResult.rows.length} exchanged product(s) from booking`);
    if (deleteProductResult.rows.length === 0) {
      console.warn('⚠️ WARNING: No product was deleted! The exchanged product might not exist in booking_products.');
    }
    
    // Check if original product already exists (shouldn't, but handle it)
    const originalExists = await client.query(
      'SELECT product_id FROM booking_products WHERE booking_id = $1 AND product_id = $2',
      [exchange.booking_id, exchange.original_product_id]
    );
    
    if (originalExists.rows.length > 0) {
      console.warn('⚠️ Original product already exists in booking, skipping insert');
    } else {
      // Add back the original product (reverting this specific exchange)
      await client.query(
        'INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to) VALUES ($1, $2, $3, $4)',
        [exchange.booking_id, exchange.original_product_id, bookedFrom, bookedTo]
      );
      console.log('✅ Restored original product to booking');
    }
    
    // Log products after deletion
    const productsAfter = await client.query(
      `SELECT bp.product_id, p.code, p.name, p.rent_per_day, p.security_deposit
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1
       ORDER BY p.name`,
      [exchange.booking_id]
    );
    console.log('\n📦 PRODUCTS **AFTER** DELETION:');
    productsAfter.rows.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name} (${p.code}) - Rent: ₹${p.rent_per_day}, Security: ₹${p.security_deposit}`);
    });
    console.log('  Total Products:', productsAfter.rows.length);
    console.log('');
    
    // Parse exchange reason to find additional products that were added
    // Format: "Added: Product Name (CODE)"
    const additionalProductCodes = [];
    if (exchange.reason && exchange.reason.includes('Added:')) {
      const matches = exchange.reason.match(/Added:.*?\(([A-Z]+-\d+)\)/g);
      if (matches) {
        matches.forEach(match => {
          const codeMatch = match.match(/\(([A-Z]+-\d+)\)/);
          if (codeMatch) {
            additionalProductCodes.push(codeMatch[1]);
          }
        });
      }
    }
    
    console.log('🔍 CHECKING FOR ADDITIONAL PRODUCTS TO REMOVE:');
    if (additionalProductCodes.length > 0) {
      console.log(`  Found ${additionalProductCodes.length} additional product(s) in reason: ${additionalProductCodes.join(', ')}`);
      
      // Get product IDs from codes
      for (const code of additionalProductCodes) {
        const productResult = await client.query(
          'SELECT id, name, code FROM products WHERE code = $1',
          [code]
        );
        
        if (productResult.rows.length > 0) {
          const product = productResult.rows[0];
          console.log(`  Removing additional product: ${product.name} (${product.code})`);
          
          const deleteAdditionalResult = await client.query(
            'DELETE FROM booking_products WHERE booking_id = $1 AND product_id = $2 RETURNING product_id',
            [exchange.booking_id, product.id]
          );
          
          if (deleteAdditionalResult.rows.length > 0) {
            console.log(`  ✅ Removed additional product: ${product.name} (${product.code})`);
          } else {
            console.log(`  ⚠️ Additional product not found in booking: ${product.name} (${product.code})`);
          }
        }
      }
    } else {
      console.log('  No additional products found in exchange reason');
    }
    console.log('');
    
    // Recalculate booking total_amount and security_deposit as sum of all products
    const recalcResult = await client.query(
      `SELECT 
        COALESCE(SUM(p.rent_per_day), 0) as total_rent,
        COALESCE(SUM(p.security_deposit), 0) as total_security,
        MIN(bp.booked_from) as min_booked_from,
        MAX(bp.booked_to) as max_booked_to
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1`,
      [exchange.booking_id]
    );
    
    const newTotalRent = parseFloat(recalcResult.rows[0].total_rent) || 0;
    const newTotalSecurity = parseFloat(recalcResult.rows[0].total_security) || 0;
    const minBookedFrom = recalcResult.rows[0].min_booked_from;
    const maxBookedTo = recalcResult.rows[0].max_booked_to;
    
    console.log('🔢 RECALCULATED TOTALS:');
    console.log('  New Total Rent (sum of products):', `₹${newTotalRent}`);
    console.log('  New Total Security (sum of products):', `₹${newTotalSecurity}`);
    console.log('  Min Booked From (earliest start date):', minBookedFrom);
    console.log('  Max Booked To (latest end date):', maxBookedTo);
    
    // Get current other_charges (transportation, etc.) - these should NOT be reset
    const bookingChargesResult = await client.query(
      `SELECT COALESCE(other_charges, 0) as other_charges, discount_type, discount_value, discount_amount FROM bookings WHERE id = $1`,
      [exchange.booking_id]
    );
    const otherCharges = parseFloat(bookingChargesResult.rows[0].other_charges) || 0;
    const hasDiscount = bookingChargesResult.rows[0].discount_type && parseFloat(bookingChargesResult.rows[0].discount_value) > 0;
    console.log('  Other Charges (preserved):', `₹${otherCharges}`);
    
    // total_amount = sum of products' rent + other_charges (transportation, etc.)
    // security_deposit = sum of products' security deposits ONLY (not affected by transportation)
    // NOTE: When reverting exchange, discount remains REMOVED (not restored)
    const newTotalAmount = newTotalRent + otherCharges;
    console.log('  New Total Amount (rent + other charges):', `₹${newTotalAmount}`);
    console.log('');
    
    if (hasDiscount) {
      console.log(`⚠️  Note: Original discount was removed during exchange and will NOT be restored`);
    }
    
    // Update booking with recalculated totals AND booking dates (min start date and max end date)
    // IMPORTANT: total_amount includes other_charges, but security_deposit does NOT
    // Discount remains removed (not restored when reverting exchange)
    await client.query(
      `UPDATE bookings 
       SET total_amount = $1,
           security_deposit = $2,
           booked_from = $3,
           booked_to = $4,
           discount_type = NULL,
           discount_value = 0,
           discount_amount = 0,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $5`,
      [newTotalAmount, newTotalSecurity, minBookedFrom, maxBookedTo, exchange.booking_id]
    );
    
    console.log('🗑️ HANDLING EXCHANGE-RELATED TRANSACTIONS:');
    
    // Handle exchange-specific transactions
    const exchangedBy = exchange.exchanged_by;
    const originalProductName = exchange.original_product_name || '';
    const exchangedProductName = exchange.exchanged_product_name || '';
    
    // First, find penalty transactions to DELETE
    const penaltyTransactions = await client.query(
      `SELECT id, amount, type, method, notes
       FROM payment_transactions 
       WHERE booking_id = $1 
       AND transaction_type = 'exchange_penalty'`,
      [exchange.booking_id]
    );
    
    // Then, find rent difference transactions to MARK AS LAPSED (not delete)
    const rentDifferenceTransactions = await client.query(
      `SELECT id, amount, type, method, notes
       FROM payment_transactions 
       WHERE booking_id = $1 
       AND (
         transaction_type = 'exchange_upgrade'
         OR transaction_type = 'exchange_downgrade'
       )`,
      [exchange.booking_id]
    );
    
    console.log(`  Found ${penaltyTransactions.rows.length} penalty transaction(s) to DELETE:`);
    penaltyTransactions.rows.forEach((t, idx) => {
      console.log(`  ${idx + 1}. ID: ${t.id}, Amount: ₹${t.amount}, Method: ${t.method}`);
    });
    
    console.log(`  Found ${rentDifferenceTransactions.rows.length} rent difference transaction(s) to MARK AS LAPSED:`);
    rentDifferenceTransactions.rows.forEach((t, idx) => {
      console.log(`  ${idx + 1}. ID: ${t.id}, Amount: ₹${t.amount}, Method: ${t.method}`);
      if (t.notes) console.log(`     Notes: ${t.notes.substring(0, 100)}`);
    });
    console.log('');
    
    // DELETE penalty transactions (fully removed)
    const deletedPenalties = await client.query(
      `DELETE FROM payment_transactions 
       WHERE booking_id = $1 
       AND transaction_type = 'exchange_penalty'
       RETURNING id, amount`,
      [exchange.booking_id]
    );
    
    console.log(`✅ Deleted ${deletedPenalties.rows.length} penalty transaction(s)`);
    
    // MARK rent difference as LAPSED (non-refundable, kept for records)
    const lapsedTransactions = await client.query(
      `UPDATE payment_transactions 
       SET transaction_type = 'exchange_lapsed',
           notes = CONCAT(notes, ' | [LAPSED - Exchange Deleted: Non-refundable amount paid for cancelled exchange]')
       WHERE booking_id = $1 
       AND (transaction_type = 'exchange_upgrade' OR transaction_type = 'exchange_downgrade')
       RETURNING id, amount`,
      [exchange.booking_id]
    );
    
    console.log(`✅ Marked ${lapsedTransactions.rows.length} rent difference transaction(s) as LAPSED (non-refundable)`);
    console.log('');
    
    // IMPORTANT: Recalculate paid_amount from remaining transactions after deletion
    // This ensures paid_amount matches actual transactions (excluding exchange_penalty and exchange_lapsed)
    const remainingTransactions = await client.query(
      `SELECT amount, type, method
       FROM payment_transactions
       WHERE booking_id = $1
       AND type IN ('payment', 'refund')
       AND (transaction_type IS NULL OR transaction_type NOT IN ('exchange_penalty', 'exchange_lapsed', 'exchange'))`,
      [exchange.booking_id]
    );
    
    const recalculatedPaidAmount = remainingTransactions.rows.reduce((sum, t) => {
      const amount = parseFloat(t.amount) || 0;
      return sum + (t.type === 'refund' ? -amount : amount);
    }, 0);
    
    console.log('💰 RECALCULATING PAID AMOUNT:');
    console.log('  Remaining Transactions:', remainingTransactions.rows.length);
    console.log('  Recalculated Paid Amount:', `₹${recalculatedPaidAmount}`);
    console.log('');
    
    // Update booking with recalculated paid_amount
    await client.query(
      `UPDATE bookings 
       SET paid_amount = $1,
           due_amount = total_amount - $1,
           payment_status = CASE 
             WHEN $1 >= total_amount THEN 'paid'
             WHEN $1 > 0 THEN 'partial'
             ELSE 'unpaid'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [recalculatedPaidAmount, exchange.booking_id]
    );
    
    console.log('📊 UPDATED BOOKING AMOUNTS:');
    console.log('  Paid Amount:', `₹${recalculatedPaidAmount}`);
    console.log('  Due Amount:', `₹${newTotalRent - recalculatedPaidAmount}`);
    console.log('');
    
    // Get all transactions AFTER deletion
    const transactionsAfter = await client.query(
      `SELECT id, amount, type, method, notes
       FROM payment_transactions
       WHERE booking_id = $1
       ORDER BY created_at`,
      [exchange.booking_id]
    );
    
    console.log('💰 TRANSACTIONS **AFTER** DELETION:');
    transactionsAfter.rows.forEach((t, idx) => {
      console.log(`  ${idx + 1}. ID: ${t.id}, Amount: ₹${t.amount}, Type: ${t.type}, Method: ${t.method}`);
      if (t.notes) console.log(`     Notes: ${t.notes.substring(0, 100)}`);
    });
    console.log('  Total Transactions:', transactionsAfter.rows.length);
    console.log('');
    
    // Get final booking state AFTER deletion
    const bookingAfter = await client.query(
      `SELECT total_amount, security_deposit, paid_amount, due_amount, payment_status
       FROM bookings
       WHERE id = $1`,
      [exchange.booking_id]
    );
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    FINAL STATE AFTER DELETION                 ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 BOOKING STATE **AFTER** DELETION:');
    console.log('  Total Rent:', `₹${bookingAfter.rows[0].total_amount}`);
    console.log('  Total Security:', `₹${bookingAfter.rows[0].security_deposit}`);
    console.log('  Paid Amount:', `₹${bookingAfter.rows[0].paid_amount || 0}`);
    console.log('  Due Amount:', `₹${bookingAfter.rows[0].due_amount || 0}`);
    console.log('  Payment Status:', bookingAfter.rows[0].payment_status);
    console.log('');
    console.log('📦 PRODUCTS **AFTER** DELETION: (see above)');
    console.log(`  Total: ${productsAfter.rows.length} product(s)`);
    console.log('');
    console.log('💰 TRANSACTIONS **AFTER** DELETION: (see above)');
    console.log(`  Total: ${transactionsAfter.rows.length} transaction(s)`);
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           EXCHANGE DELETION COMPLETED SUCCESSFULLY            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    
    // Delete exchange record
    await client.query('DELETE FROM product_exchanges WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({ message: 'Exchange deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting exchange:', error);
    res.status(500).json({ error: 'Failed to delete exchange' });
  } finally {
    client.release();
  }
});

module.exports = router;

