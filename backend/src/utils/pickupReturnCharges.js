/**
 * Early Pickup and Late Return Charge Calculation Algorithm
 * 
 * This module calculates charges for:
 * 1. Early Pickup - When customer picks up before scheduled date
 * 2. Late Return - When customer returns after scheduled date
 */

/**
 * Calculate early pickup charges
 * @param {Date} scheduledPickupDate - Original pickup date from booking
 * @param {Date} actualPickupDate - When customer actually picked up
 * @param {Number} rentPerDay - Daily rental rate
 * @param {Number} earlyPickupChargePercent - Percentage to charge (from settings)
 * @returns {Object} - { isEarly, days, chargeAmount, chargePercent }
 */
function calculateEarlyPickupCharge(scheduledPickupDate, actualPickupDate, rentPerDay, earlyPickupChargePercent = 0) {
  const scheduled = new Date(scheduledPickupDate);
  const actual = new Date(actualPickupDate);
  
  // Reset time to start of day for accurate comparison
  scheduled.setHours(0, 0, 0, 0);
  actual.setHours(0, 0, 0, 0);
  
  // Calculate days early
  const diffTime = scheduled - actual;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const isEarly = diffDays > 0;
  const earlyDays = isEarly ? diffDays : 0;
  
  // Calculate charge: (days early) × (rent per day) × (charge percentage)
  const chargeAmount = isEarly ? (earlyDays * rentPerDay * (earlyPickupChargePercent / 100)) : 0;
  
  return {
    isEarly,
    days: earlyDays,
    chargeAmount: Math.round(chargeAmount),
    chargePercent: earlyPickupChargePercent,
    description: isEarly 
      ? `Early pickup by ${earlyDays} day${earlyDays > 1 ? 's' : ''}`
      : 'On-time pickup'
  };
}

/**
 * Calculate late return charges
 * @param {Date} scheduledReturnDate - Original return date from booking
 * @param {Date} actualReturnDate - When customer actually returned
 * @param {Number} rentPerDay - Daily rental rate
 * @param {Number} lateReturnChargePercent - Percentage to charge (from settings)
 * @returns {Object} - { isLate, days, chargeAmount, chargePercent }
 */
function calculateLateReturnCharge(scheduledReturnDate, actualReturnDate, rentPerDay, lateReturnChargePercent = 100) {
  const scheduled = new Date(scheduledReturnDate);
  const actual = new Date(actualReturnDate);
  
  // Reset time to start of day for accurate comparison
  scheduled.setHours(0, 0, 0, 0);
  actual.setHours(0, 0, 0, 0);
  
  // Calculate days late
  const diffTime = actual - scheduled;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const isLate = diffDays > 0;
  const lateDays = isLate ? diffDays : 0;
  
  // Calculate charge: (days late) × (rent per day) × (charge percentage)
  // Default 100% means full rental rate for late days
  const chargeAmount = isLate ? (lateDays * rentPerDay * (lateReturnChargePercent / 100)) : 0;
  
  return {
    isLate,
    days: lateDays,
    chargeAmount: Math.round(chargeAmount),
    chargePercent: lateReturnChargePercent,
    description: isLate 
      ? `Late return by ${lateDays} day${lateDays > 1 ? 's' : ''}`
      : 'On-time return'
  };
}

/**
 * Calculate combined charges for a booking
 * @param {Object} booking - Booking object with dates
 * @param {Array} products - Array of products with tracking data
 * @param {Object} settings - Charge settings
 * @returns {Object} - Complete charge breakdown
 */
function calculateBookingCharges(booking, products, settings = {}) {
  const {
    earlyPickupChargePercent = 0,
    lateReturnChargePercent = 100
  } = settings;
  
  let totalEarlyPickupCharge = 0;
  let totalLateReturnCharge = 0;
  const productCharges = [];
  
  products.forEach(product => {
    const charges = {
      productId: product.id,
      productName: product.name,
      productCode: product.code,
      rentPerDay: product.rent_per_day,
      earlyPickup: null,
      lateReturn: null
    };
    
    // Calculate early pickup if applicable
    if (product.actual_pickup_date) {
      charges.earlyPickup = calculateEarlyPickupCharge(
        booking.booked_from,
        product.actual_pickup_date,
        product.rent_per_day,
        earlyPickupChargePercent
      );
      totalEarlyPickupCharge += charges.earlyPickup.chargeAmount;
    }
    
    // Calculate late return if applicable
    if (product.actual_return_date) {
      charges.lateReturn = calculateLateReturnCharge(
        booking.booked_to,
        product.actual_return_date,
        product.rent_per_day,
        lateReturnChargePercent
      );
      totalLateReturnCharge += charges.lateReturn.chargeAmount;
    }
    
    productCharges.push(charges);
  });
  
  return {
    baseAmount: booking.total_amount,
    earlyPickupCharge: totalEarlyPickupCharge,
    lateReturnCharge: totalLateReturnCharge,
    additionalCharges: totalEarlyPickupCharge + totalLateReturnCharge,
    finalAmount: booking.total_amount + totalEarlyPickupCharge + totalLateReturnCharge,
    productCharges,
    settings: {
      earlyPickupChargePercent,
      lateReturnChargePercent
    }
  };
}

module.exports = {
  calculateEarlyPickupCharge,
  calculateLateReturnCharge,
  calculateBookingCharges
};

