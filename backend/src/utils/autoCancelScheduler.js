// Auto-cancel scheduler - runs every minute to check for expired pending bookings
// Calls the DB logic directly — no HTTP round-trip needed.
const { checkAndCancelExpiredBookings } = require('./autoCancelService');

async function runCheck() {
  try {
    const result = await checkAndCancelExpiredBookings();
    if (result.cancelled.length > 0) {
      console.log(`✅ Auto-cancelled ${result.cancelled.length} expired booking(s)`);
      result.cancelled.forEach(booking => {
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
  runCheck(); // Run immediately on startup
  setInterval(runCheck, 60 * 1000); // Then every minute
}

module.exports = { startScheduler };
