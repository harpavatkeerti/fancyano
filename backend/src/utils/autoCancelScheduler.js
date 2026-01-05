// Auto-cancel scheduler - runs every minute to check for expired pending bookings
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001/api';

async function checkAndCancelExpiredBookings() {
  try {
    const response = await axios.post(`${API_URL}/auto-cancel/check`);
    if (response.data.cancelled && response.data.cancelled.length > 0) {
      console.log(`✅ Auto-cancelled ${response.data.cancelled.length} expired booking(s)`);
      response.data.cancelled.forEach(booking => {
        console.log(`  - Booking #${booking.id} (${booking.customer_name})`);
      });
    }
  } catch (error) {
    console.error('❌ Error checking for expired bookings:', error.message);
  }
}

// Run every minute
function startScheduler() {
  console.log('🕐 Auto-cancel scheduler started (checking every minute)');
  checkAndCancelExpiredBookings(); // Run immediately
  setInterval(checkAndCancelExpiredBookings, 60 * 1000); // Then every minute
}

module.exports = { startScheduler, checkAndCancelExpiredBookings };

