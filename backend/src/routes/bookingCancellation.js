const express = require('express');
const router = express.Router();
const pool = require('../database/connection');

// POST cancel booking (full or partial)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      booking_id,
      product_ids, // Array of product IDs to cancel (optional - if not provided, cancel all)
      per_product_penalties, // Array of { product_id, penalty_amount, notes } for manual penalties
      cancellation_reason,
      cancelled_by,
      cancellation_date,
      extra_refund, // Optional: additional refund amount
      extra_refund_note // Optional: note for extra refund
    } = req.body;
    
    if (!booking_id) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }
    
    // Fetch booking details with products
    const bookingResult = await client.query(
      `SELECT b.*, 
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)) FILTER (
                WHERE pt.type = 'payment' 
                AND (pt.transaction_type IS NULL OR pt.transaction_type NOT IN ('exchange_lapsed', 'lapsed_refund', 'cancellation_penalty'))
              ), 0) as total_paid,
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)) FILTER (
                WHERE pt.type = 'refund'
              ), 0) as total_refunded
       FROM bookings b
       LEFT JOIN payment_transactions pt ON b.id = pt.booking_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check for discount - if partial cancellation, discount will be removed
    const hasDiscount = booking.discount_type && booking.discount_value > 0;
    const originalDiscountType = booking.discount_type;
    const originalDiscountValue = parseFloat(booking.discount_value) || 0;
    const originalDiscountAmount = parseFloat(booking.discount_amount) || 0;
    
    // Check if booking is completed
    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel completed booking' });
    }
    
    // Fetch active products for this booking
    const productsResult = await client.query(
      `SELECT bp.*, p.name, p.code, p.rent_per_day, p.security_deposit
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1 AND bp.status = 'active'
       ORDER BY p.name`,
      [booking_id]
    );
    
    if (productsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No active products to cancel in this booking' });
    }
    
    const allProducts = productsResult.rows;
    
    // Determine which products to cancel
    const productsToCancel = product_ids && product_ids.length > 0
      ? allProducts.filter(p => product_ids.includes(p.product_id))
      : allProducts; // Cancel all if no specific products selected
    
    if (productsToCancel.length === 0) {
      return res.status(400).json({ error: 'No valid products selected for cancellation' });
    }
    
    const bookingDate = new Date(booking.booking_date);
    const cancellationDateObj = cancellation_date ? new Date(cancellation_date) : new Date();
    const daysDiff = Math.floor((cancellationDateObj - bookingDate) / (1000 * 60 * 60 * 24));
    
    console.log('📅 CANCELLATION REQUEST:');
    console.log(`  Booking ID: ${booking_id}`);
    console.log(`  Booking Date: ${bookingDate.toISOString().split('T')[0]}`);
    console.log(`  Cancellation Date: ${cancellationDateObj.toISOString().split('T')[0]}`);
    console.log(`  Days from booking: ${daysDiff}`);
    console.log(`  Products to cancel: ${productsToCancel.length} out of ${allProducts.length}`);
    
    // Fetch cancellation policy
    let cancellationPolicy = null;
    let penaltyPercentage = 0;
    
    try {
      const policyResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['cancellation_policy']
      );
      if (policyResult.rows.length > 0) {
        cancellationPolicy = JSON.parse(policyResult.rows[0].setting_value);
        console.log('📋 Cancellation Policy:', cancellationPolicy);
      }
    } catch (error) {
      console.error('Error fetching cancellation policy:', error);
    }
    
    // Calculate penalty percentage based on cancellation policy
    if (cancellationPolicy && cancellationPolicy.days) {
      const days = cancellationPolicy.days;
      const penalties = [
        cancellationPolicy.before_7_days || 0,
        cancellationPolicy.before_3_days || 0,
        cancellationPolicy.before_1_day || 0,
        cancellationPolicy.on_booking_date || 0
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
      
      console.log(`💰 Penalty Percentage: ${penaltyPercentage}%`);
    }
    
    const totalPaid = parseFloat(booking.total_paid) || 0;
    const totalRefunded = parseFloat(booking.total_refunded) || 0;
    const netPaid = totalPaid - totalRefunded;
    
    console.log(`💵 Total Paid: ₹${totalPaid}, Refunded: ₹${totalRefunded}, Net: ₹${netPaid}`);
    
    // Get the total amount for the booking (rent only, without security)
    const bookingTotalRent = parseFloat(booking.total_amount) || 0;
    const bookingSecurityDeposit = parseFloat(booking.security_deposit) || 0;
    
    // Calculate how much of rent was actually paid (rent is paid first, then security)
    const paidRent = Math.min(netPaid, bookingTotalRent);
    
    // Calculate how much of security deposit was actually paid
    // Security is paid only after rent is fully covered
    const paidSecurityDeposit = Math.max(0, Math.min(netPaid - bookingTotalRent, bookingSecurityDeposit));
    
    console.log('💳 PAYMENT STATUS:');
    console.log(`  Total Rent Required: ₹${bookingTotalRent.toFixed(2)}`);
    console.log(`  Paid Rent: ₹${paidRent.toFixed(2)}`);
    console.log(`  Security Deposit Required: ₹${bookingSecurityDeposit.toFixed(2)}`);
    console.log(`  Paid Security Deposit: ₹${paidSecurityDeposit.toFixed(2)}`);
    
    // Calculate penalties and refunds for each product
    let totalPenaltyAmount = 0;
    let totalCancelledRentRequired = 0;
    let totalCancelledSecurityRequired = 0;
    const cancelledProducts = [];
    
    for (const product of productsToCancel) {
      const productRent = parseFloat(product.rent_per_day) || 0;
      const productSecurity = parseFloat(product.security_deposit) || 0;
      
      // Track rent and security of cancelled products (required amounts)
      totalCancelledRentRequired += productRent;
      totalCancelledSecurityRequired += productSecurity;
      
      // Check if manual penalty was provided for this product
      const manualPenalty = per_product_penalties?.find(p => p.product_id === product.product_id);
      const penaltyAmount = manualPenalty 
        ? parseFloat(manualPenalty.penalty_amount) || 0
        : (productRent * penaltyPercentage) / 100;
      
      totalPenaltyAmount += penaltyAmount;
      
      // NOTE: Penalty transaction is NOT created separately
      // The penalty is already deducted from the refund amount
      // Creating a separate penalty transaction would cause double-counting
      // if (penaltyAmount > 0) {
      //   const notes = manualPenalty?.notes || 
      //     `Cancellation penalty for ${product.name} (${product.code}): ${penaltyPercentage}% of rent ₹${productRent} | Reason: ${cancellation_reason || 'Not specified'}`;
      //   
      //   await client.query(
      //     `INSERT INTO payment_transactions 
      //      (booking_id, amount, type, transaction_type, method, notes, recorded_by)
      //      VALUES ($1, $2, 'payment', 'cancellation_penalty', $3, $4, $5)`,
      //     [booking_id, penaltyAmount, 'N/A', notes, cancelled_by || 'system']
      //   );
      //   
      //   console.log(`✅ Recorded penalty for ${product.code}: ₹${penaltyAmount}`);
      // }
      
      console.log(`✅ Penalty of ₹${penaltyAmount} for ${product.code} deducted from refund (no separate transaction created)`);
      
      // Mark product as cancelled (don't delete)
      await client.query(
        `UPDATE booking_products 
         SET status = 'cancelled'
         WHERE booking_id = $1 AND product_id = $2`,
        [booking_id, product.product_id]
      );
      
      cancelledProducts.push({
        product_id: product.product_id,
        code: product.code,
        name: product.name,
        rent: productRent,
        security: productSecurity,
        penalty: penaltyAmount
      });
      
      console.log(`✅ Marked ${product.code} as cancelled`);
    }
    
    // ============ NEW REFUND CALCULATION LOGIC ============
    // Formula: Refund = Total Booking Rent - (Remaining Due + Penalty + Remaining Product Rent)
    
    // Calculate remaining product rent (products NOT being cancelled)
    const remainingRentRequired = bookingTotalRent - totalCancelledRentRequired;
    
    // Calculate the difference (amount still due for total booking)
    const differenceOfAmountPaid = Math.max(0, bookingTotalRent - netPaid);
    
    // Calculate refund using the correct formula
    // Refund = Total Booking Rent - (Remaining Due + Penalty + Remaining Product Rent)
    const extraRefundAmount = parseFloat(extra_refund) || 0;
    const calculatedRefund = bookingTotalRent - (differenceOfAmountPaid + totalPenaltyAmount + remainingRentRequired) + extraRefundAmount;
    
    console.log('🔢 NEW REFUND CALCULATION:');
    console.log(`  Total Booking Rent: ₹${Math.floor(bookingTotalRent)}`);
    console.log(`  Cancelled Products Rent: ₹${Math.floor(totalCancelledRentRequired)}`);
    console.log(`  Remaining Products Rent: ₹${Math.floor(remainingRentRequired)}`);
    console.log(`  Advance Paid (Net): ₹${Math.floor(netPaid)}`);
    console.log(`  Remaining Due: ₹${Math.floor(differenceOfAmountPaid)}`);
    console.log(`  Total Penalty: ₹${Math.floor(totalPenaltyAmount)}`);
    console.log(`  Extra Refund: ₹${Math.floor(extraRefundAmount)}`);
    console.log(`  Formula: ${Math.floor(bookingTotalRent)} - (${Math.floor(differenceOfAmountPaid)} + ${Math.floor(totalPenaltyAmount)} + ${Math.floor(remainingRentRequired)}) = ₹${Math.floor(calculatedRefund)}`);
    console.log(`  Final Refund Amount: ₹${Math.floor(calculatedRefund)}`);
    
    let paymentAction = null;
    let paymentDifference = 0;
    
    if (calculatedRefund > 0) {
      paymentAction = 'refund';
      paymentDifference = calculatedRefund;
      
      // Record refund transaction
      if (calculatedRefund > 0) {
        // Build detailed notes with product-by-product breakdown
        let productDetails = productsToCancel.map(p => {
          const pPenalty = (parseFloat(p.rent_per_day) * penaltyPercentage) / 100;
          return `${p.name} (${p.code}): Rent ₹${Math.floor(parseFloat(p.rent_per_day))} - Penalty ₹${Math.floor(pPenalty)}`;
        }).join('; ');
        
        const refundNotes = `Cancellation refund for ${productsToCancel.length} product(s). Formula: Total Booking Rent ₹${Math.floor(bookingTotalRent)} - (Remaining Due ₹${Math.floor(differenceOfAmountPaid)} + Penalty ₹${Math.floor(totalPenaltyAmount)} + Remaining Product Rent ₹${Math.floor(remainingRentRequired)}) = ₹${Math.floor(calculatedRefund)}${extraRefundAmount > 0 ? ` + Extra ₹${Math.floor(extraRefundAmount)}` : ''}. Products: ${productDetails}${extra_refund_note ? ` | Note: ${extra_refund_note}` : ''} | Reason: ${cancellation_reason || 'Not specified'}`;
        
        await client.query(
          `INSERT INTO payment_transactions 
           (booking_id, amount, type, transaction_type, method, notes, recorded_by)
           VALUES ($1, $2, 'refund', 'cancellation_refund', $3, $4, $5)`,
          [booking_id, calculatedRefund, 'N/A', refundNotes, cancelled_by || 'system']
        );
        
        console.log(`✅ Recorded refund transaction: ₹${calculatedRefund.toFixed(2)}`);
      }
    } else if (calculatedRefund < 0) {
      // Customer owes money (penalty > rent + security)
      paymentAction = 'collect';
      paymentDifference = Math.abs(calculatedRefund);
      console.log(`⚠️  Customer needs to pay additional: ₹${paymentDifference.toFixed(2)}`);
    } else {
      paymentAction = 'none';
      console.log(`✅ No refund or collection needed (balanced)`);
    }
    
    // Store cancellation record
    await client.query(
      `INSERT INTO booking_cancellations 
       (booking_id, cancelled_products, total_rent, total_security, total_penalty, 
        extra_refund, extra_refund_note, refund_amount, cancellation_reason, cancelled_by, cancellation_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        booking_id,
        JSON.stringify(cancelledProducts),
        totalCancelledRentRequired, // Total rent for cancelled products
        totalCancelledSecurityRequired, // Total security for cancelled products
        totalPenaltyAmount,
        extraRefundAmount,
        extra_refund_note || null,
        calculatedRefund,
        cancellation_reason,
        cancelled_by || 'system',
        cancellationDateObj
      ]
    );
    
    console.log(`✅ Cancellation record saved to database`);
    
    // Recalculate booking totals with remaining active products
    const remainingProductsResult = await client.query(
      `SELECT
        COALESCE(SUM(p.rent_per_day), 0) as total_rent,
        COALESCE(SUM(p.security_deposit), 0) as total_security,
        MIN(bp.booked_from) as min_booked_from,
        MAX(bp.booked_to) as max_booked_to
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1 AND bp.status = 'active'`,
      [booking_id]
    );
    
    const newTotalRent = parseFloat(remainingProductsResult.rows[0].total_rent) || 0;
    const newTotalSecurity = parseFloat(remainingProductsResult.rows[0].total_security) || 0;
    const minBookedFrom = remainingProductsResult.rows[0].min_booked_from;
    const maxBookedTo = remainingProductsResult.rows[0].max_booked_to;
    const transportationCharges = parseFloat(booking.other_charges) || 0;
    
    // Update booking status and totals
    const isPartialCancellation = productsToCancel.length < allProducts.length;
    // If partial cancellation, set status to 'confirmed' (booking continues with remaining products)
    // If full cancellation, set status to 'cancelled'
    const newStatus = isPartialCancellation ? 'confirmed' : 'cancelled';
    
    // IMPORTANT: For partial cancellation, remove discount entirely (Option B approach)
    // New total = remaining product rent + transportation (no discount)
    let finalTotalAmount = newTotalRent + transportationCharges;
    
    if (isPartialCancellation && hasDiscount) {
      console.log(`🔄 DISCOUNT REMOVAL (Partial Cancellation):`);
      console.log(`  Original Discount: ${originalDiscountType} ${originalDiscountValue}${originalDiscountType === 'percentage' ? '%' : ''} = ₹${originalDiscountAmount}`);
      console.log(`  Remaining Products Rent: ₹${newTotalRent}`);
      console.log(`  Transportation: ₹${transportationCharges}`);
      console.log(`  New Total (without discount): ₹${finalTotalAmount}`);
      console.log(`  Note: Discount removed due to partial cancellation`);
    }
    
    // If there are remaining active products, update booking dates to match them
    // If all products are cancelled, keep the original dates
    if (isPartialCancellation && minBookedFrom && maxBookedTo) {
      await client.query(
        `UPDATE bookings 
         SET status = $1,
             total_amount = $2,
             security_deposit = $3,
             booked_from = $4,
             booked_to = $5,
             discount_type = NULL,
             discount_value = 0,
             discount_amount = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [newStatus, finalTotalAmount, newTotalSecurity, minBookedFrom, maxBookedTo, booking_id]
      );
    } else {
      // Full cancellation or no active products remain - don't update dates, keep discount for records
      await client.query(
        `UPDATE bookings 
         SET status = $1,
             total_amount = $2,
             security_deposit = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newStatus, finalTotalAmount, newTotalSecurity, booking_id]
      );
    }
    
    console.log(`✅ Booking status updated to: ${newStatus}`);
    console.log(`✅ New total_amount: ₹${finalTotalAmount}`);
    console.log(`✅ New security_deposit: ₹${newTotalSecurity}`);
    if (isPartialCancellation && hasDiscount) {
      console.log(`⚠️  Discount removed from booking due to partial cancellation`);
    }
    
    await client.query('COMMIT');
    
    res.json({ 
      message: isPartialCancellation ? 'Products cancelled successfully' : 'Booking cancelled successfully',
      cancellation_details: {
        cancelled_products: cancelledProducts,
        total_cancelled_rent: totalCancelledRentRequired,
        total_cancelled_security: totalCancelledSecurityRequired,
        total_penalty_amount: totalPenaltyAmount,
        difference_of_amount_paid: differenceOfAmountPaid,
        remaining_rent_required: remainingRentRequired,
        advance_paid: netPaid,
        extra_refund: extraRefundAmount,
        extra_refund_note: extra_refund_note,
        refund_amount: calculatedRefund,
        payment_action: paymentAction,
        payment_difference: paymentDifference,
        new_status: newStatus,
        remaining_products_count: allProducts.length - productsToCancel.length,
        new_total_rent: newTotalRent,
        new_security_deposit: newTotalSecurity,
        discount_removed: isPartialCancellation && hasDiscount,
        original_discount_info: hasDiscount ? {
          type: originalDiscountType,
          value: originalDiscountValue,
          amount: originalDiscountAmount
        } : null
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
  } finally {
    client.release();
  }
});

// GET cancellation preview (calculate without committing)
router.get('/preview/:booking_id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { booking_id } = req.params;
    const { product_ids } = req.query; // Optional: comma-separated product IDs
    
    // Fetch booking details
    const bookingResult = await client.query(
      `SELECT b.*, 
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)) FILTER (
                WHERE pt.type = 'payment' 
                AND (pt.transaction_type IS NULL OR pt.transaction_type NOT IN ('exchange_lapsed', 'lapsed_refund', 'cancellation_penalty'))
              ), 0) as total_paid,
              COALESCE(SUM(CAST(pt.amount AS DECIMAL)) FILTER (
                WHERE pt.type = 'refund'
              ), 0) as total_refunded
       FROM bookings b
       LEFT JOIN payment_transactions pt ON b.id = pt.booking_id
       WHERE b.id = $1
       GROUP BY b.id`,
      [booking_id]
    );
    
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = bookingResult.rows[0];
    
    // Check for discount - if partial cancellation, discount will be removed
    const hasDiscount = booking.discount_type && booking.discount_value > 0;
    const originalDiscountType = booking.discount_type;
    const originalDiscountValue = parseFloat(booking.discount_value) || 0;
    const originalDiscountAmount = parseFloat(booking.discount_amount) || 0;
    
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }
    
    // Fetch active products
    const productsResult = await client.query(
      `SELECT bp.*, p.name, p.code, p.rent_per_day, p.security_deposit
       FROM booking_products bp
       JOIN products p ON bp.product_id = p.id
       WHERE bp.booking_id = $1 AND bp.status = 'active'
       ORDER BY p.name`,
      [booking_id]
    );
    
    const allProducts = productsResult.rows;
    
    // Filter products if specific IDs provided
    let productsToCancel = allProducts;
    if (product_ids) {
      const selectedIds = product_ids.split(',').map(id => parseInt(id));
      productsToCancel = allProducts.filter(p => selectedIds.includes(p.product_id));
    }
    
    const bookingDate = new Date(booking.booking_date);
    const today = new Date();
    const daysDiff = Math.floor((today - bookingDate) / (1000 * 60 * 60 * 24));
    
    // Fetch cancellation policy
    let cancellationPolicy = null;
    let penaltyPercentage = 0;
    
    try {
      const policyResult = await client.query(
        'SELECT setting_value FROM settings WHERE setting_key = $1',
        ['cancellation_policy']
      );
      if (policyResult.rows.length > 0) {
        cancellationPolicy = JSON.parse(policyResult.rows[0].setting_value);
      }
    } catch (error) {
      console.error('Error fetching cancellation policy:', error);
    }
    
    // Calculate penalty percentage
    if (cancellationPolicy && cancellationPolicy.days) {
      const days = cancellationPolicy.days;
      const penalties = [
        cancellationPolicy.before_7_days || 0,
        cancellationPolicy.before_3_days || 0,
        cancellationPolicy.before_1_day || 0,
        cancellationPolicy.on_booking_date || 0
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
    
    const totalPaid = parseFloat(booking.total_paid) || 0;
    const totalRefunded = parseFloat(booking.total_refunded) || 0;
    const netPaid = totalPaid - totalRefunded;
    
    // Get the total amount for the booking (rent only, without security)
    const bookingTotalRent = parseFloat(booking.total_amount) || 0;
    const bookingSecurityDeposit = parseFloat(booking.security_deposit) || 0;
    const totalRequired = bookingTotalRent + bookingSecurityDeposit;
    
    // Calculate how much of rent was actually paid (rent is paid first, then security)
    const paidRent = Math.min(netPaid, bookingTotalRent);
    
    // Calculate how much of security deposit was actually paid
    // Security is paid only after rent is fully covered
    const paidSecurityDeposit = Math.max(0, Math.min(netPaid - bookingTotalRent, bookingSecurityDeposit));
    
    console.log('💳 PAYMENT STATUS:');
    console.log(`  Total Rent Required: ₹${bookingTotalRent.toFixed(2)}`);
    console.log(`  Paid Rent: ₹${paidRent.toFixed(2)}`);
    console.log(`  Security Deposit Required: ₹${bookingSecurityDeposit.toFixed(2)}`);
    console.log(`  Net Paid: ₹${netPaid.toFixed(2)}`);
    console.log(`  Paid Security Deposit: ₹${paidSecurityDeposit.toFixed(2)}`);
    
    // Calculate per-product penalties and totals
    const productPenalties = productsToCancel.map(product => {
      const productRent = parseFloat(product.rent_per_day) || 0;
      const productSecurity = parseFloat(product.security_deposit) || 0;
      const penaltyAmount = (productRent * penaltyPercentage) / 100;
      
      return {
        product_id: product.product_id,
        code: product.code,
        name: product.name,
        rent: productRent,
        security_deposit: productSecurity,
        penalty_percentage: penaltyPercentage,
        penalty_amount: penaltyAmount
      };
    });
    
    const totalPenaltyAmount = productPenalties.reduce((sum, p) => sum + p.penalty_amount, 0);
    const totalCancelledRentRequired = productPenalties.reduce((sum, p) => sum + p.rent, 0);
    const totalCancelledSecurityRequired = productPenalties.reduce((sum, p) => sum + p.security_deposit, 0);
    
    // ============ NEW REFUND CALCULATION LOGIC (PREVIEW) ============
    // Formula: Refund = Total Booking Rent - (Remaining Due + Penalty + Remaining Product Rent)
    
    const remainingRentRequired = bookingTotalRent - totalCancelledRentRequired;
    const differenceOfAmountPaid = Math.max(0, bookingTotalRent - netPaid);
    const baseRefund = bookingTotalRent - (differenceOfAmountPaid + totalPenaltyAmount + remainingRentRequired);
    
    console.log('🔢 NEW REFUND CALCULATION (PREVIEW):');
    console.log(`  Total Booking Rent: ₹${Math.floor(bookingTotalRent)}`);
    console.log(`  Cancelled Products Rent: ₹${Math.floor(totalCancelledRentRequired)}`);
    console.log(`  Remaining Products Rent: ₹${Math.floor(remainingRentRequired)}`);
    console.log(`  Advance Paid (Net): ₹${Math.floor(netPaid)}`);
    console.log(`  Remaining Due: ₹${Math.floor(differenceOfAmountPaid)}`);
    console.log(`  Total Penalty: ₹${Math.floor(totalPenaltyAmount)}`);
    console.log(`  Formula: ${Math.floor(bookingTotalRent)} - (${Math.floor(differenceOfAmountPaid)} + ${Math.floor(totalPenaltyAmount)} + ${Math.floor(remainingRentRequired)}) = ₹${Math.floor(baseRefund)}`);
    console.log(`  Base Refund: ₹${Math.floor(baseRefund)}`);
    
    // Determine payment action
    let paymentAction = 'none';
    let paymentDifference = 0;
    
    if (baseRefund > 0) {
      paymentAction = 'refund';
      paymentDifference = baseRefund;
    } else if (baseRefund < 0) {
      paymentAction = 'collect';
      paymentDifference = Math.abs(baseRefund);
    }
    
    const isPartialCancellation = productsToCancel.length < allProducts.length;
    
    res.json({
      booking_id: booking.id,
      booking_date: booking.booking_date,
      days_from_booking: daysDiff,
      penalty_percentage: penaltyPercentage,
      policy: cancellationPolicy,
      all_products: allProducts.map(p => ({
        product_id: p.product_id,
        code: p.code,
        name: p.name,
        rent: parseFloat(p.rent_per_day) || 0,
        security_deposit: parseFloat(p.security_deposit) || 0
      })),
      products_to_cancel: productPenalties,
      total_cancelled_rent_required: totalCancelledRentRequired,
      total_cancelled_security_required: totalCancelledSecurityRequired,
      total_penalty_amount: totalPenaltyAmount,
      difference_of_amount_paid: differenceOfAmountPaid,
      remaining_rent_required: remainingRentRequired,
      advance_paid: netPaid,
      base_refund: baseRefund,
      total_paid: totalPaid,
      total_refunded: totalRefunded,
      net_paid: netPaid,
      paid_rent: paidRent,
      paid_security_deposit: paidSecurityDeposit,
      payment_action: paymentAction,
      payment_difference: paymentDifference,
      is_partial: isPartialCancellation,
      discount_removed: isPartialCancellation && hasDiscount,
      original_discount_info: hasDiscount ? {
        type: originalDiscountType,
        value: originalDiscountValue,
        amount: originalDiscountAmount
      } : null
    });
  } catch (error) {
    console.error('Error fetching cancellation preview:', error);
    res.status(500).json({ error: 'Failed to fetch cancellation preview', details: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
