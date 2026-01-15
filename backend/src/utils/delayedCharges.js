/**
 * Calculate delayed return charges for a product
 * @param {Date|string} scheduledReturnDate - Original return date from booking (booked_to)
 * @param {Date|string} actualReturnDate - When customer actually returned (return_date from tracking)
 * @param {number} productRentPerDay - Daily rental rate of the product
 * @param {Object} settings - Delayed charges settings { enabled: boolean, type: 'fixed'|'percentage', value: number }
 * @returns {Object} - { isDelayed, daysDelayed, chargeAmount, chargeType, chargeValue }
 */
function calculateDelayedCharges(scheduledReturnDate, actualReturnDate, productRentPerDay, settings = {}) {
  const { enabled = false, type = 'fixed', value = 0 } = settings;
  
  // If disabled, return no charge
  if (!enabled || !value || value <= 0) {
    return {
      isDelayed: false,
      daysDelayed: 0,
      chargeAmount: 0,
      chargeType: type,
      chargeValue: value,
      description: 'Delayed charges disabled'
    };
  }
  
  // If no actual return date, cannot calculate
  if (!actualReturnDate) {
    return {
      isDelayed: false,
      daysDelayed: 0,
      chargeAmount: 0,
      chargeType: type,
      chargeValue: value,
      description: 'Product not yet returned'
    };
  }
  
  const scheduled = new Date(scheduledReturnDate);
  const actual = new Date(actualReturnDate);
  
  // Reset time to start of day for accurate comparison
  scheduled.setHours(0, 0, 0, 0);
  actual.setHours(0, 0, 0, 0);
  
  // Calculate days delayed
  const diffTime = actual - scheduled;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const isDelayed = diffDays > 0;
  const daysDelayed = isDelayed ? diffDays : 0;
  
  // Calculate charge based on type
  let chargeAmount = 0;
  if (isDelayed) {
    if (type === 'fixed') {
      // Fixed amount per day
      chargeAmount = daysDelayed * value;
    } else if (type === 'percentage') {
      // Percentage of product rent per day
      chargeAmount = daysDelayed * (productRentPerDay * (value / 100));
    }
  }
  
  return {
    isDelayed,
    daysDelayed,
    chargeAmount: Math.round(chargeAmount * 100) / 100, // Round to 2 decimal places
    chargeType: type,
    chargeValue: value,
    description: isDelayed 
      ? `Delayed return by ${daysDelayed} day${daysDelayed > 1 ? 's' : ''}`
      : 'On-time return'
  };
}

/**
 * Calculate delayed charges for all products in a booking
 * @param {Array} products - Array of products with booking and tracking info
 * @param {Object} settings - Delayed charges settings
 * @returns {Object} - { totalCharge, productCharges: Array }
 */
function calculateBookingDelayedCharges(products, settings = {}) {
  const productCharges = [];
  let totalCharge = 0;
  
  products.forEach(product => {
    // Get scheduled return date (product booked_to or booking booked_to)
    const scheduledReturnDate = product.booked_to || product.booking?.booked_to;
    
    // Get actual return date from tracking
    const actualReturnDate = product.tracking?.return_date || product.return_date;
    
    // Get product rent per day
    const productRentPerDay = parseFloat(product.rent_per_day) || 0;
    
    if (scheduledReturnDate) {
      const charge = calculateDelayedCharges(
        scheduledReturnDate,
        actualReturnDate,
        productRentPerDay,
        settings
      );
      
      productCharges.push({
        productId: product.id || product.product_id,
        productCode: product.code,
        productName: product.name,
        rentPerDay: productRentPerDay,
        scheduledReturnDate,
        actualReturnDate,
        ...charge
      });
      
      totalCharge += charge.chargeAmount;
    }
  });
  
  return {
    totalCharge: Math.round(totalCharge * 100) / 100,
    productCharges,
    hasDelayedProducts: productCharges.some(p => p.isDelayed)
  };
}

module.exports = {
  calculateDelayedCharges,
  calculateBookingDelayedCharges
};
