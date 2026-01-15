/**
 * Calculate delayed return charges for a product
 */
export interface DelayedChargesSettings {
  enabled: boolean;
  type: 'fixed' | 'percentage';
  value: number;
}

export interface ProductDelayedCharge {
  productId: number;
  productCode: string;
  productName: string;
  rentPerDay: number;
  scheduledReturnDate: string;
  actualReturnDate: string | null;
  isDelayed: boolean;
  daysDelayed: number;
  chargeAmount: number;
  chargeType: 'fixed' | 'percentage';
  chargeValue: number;
  description: string;
}

export interface BookingDelayedCharges {
  totalCharge: number;
  productCharges: ProductDelayedCharge[];
  hasDelayedProducts: boolean;
}

/**
 * Calculate delayed charges for a single product
 */
export function calculateProductDelayedCharges(
  scheduledReturnDate: string | Date,
  actualReturnDate: string | Date | null,
  productRentPerDay: number,
  settings: DelayedChargesSettings
): ProductDelayedCharge {
  const { enabled = false, type = 'fixed', value = 0 } = settings;

  // If disabled, return no charge
  if (!enabled || !value || value <= 0) {
    return {
      productId: 0,
      productCode: '',
      productName: '',
      rentPerDay: productRentPerDay,
      scheduledReturnDate: typeof scheduledReturnDate === 'string' ? scheduledReturnDate : scheduledReturnDate.toISOString(),
      actualReturnDate: actualReturnDate ? (typeof actualReturnDate === 'string' ? actualReturnDate : actualReturnDate.toISOString()) : null,
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
      productId: 0,
      productCode: '',
      productName: '',
      rentPerDay: productRentPerDay,
      scheduledReturnDate: typeof scheduledReturnDate === 'string' ? scheduledReturnDate : scheduledReturnDate.toISOString(),
      actualReturnDate: null,
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
  const diffTime = actual.getTime() - scheduled.getTime();
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
    productId: 0,
    productCode: '',
    productName: '',
    rentPerDay: productRentPerDay,
    scheduledReturnDate: scheduled.toISOString(),
    actualReturnDate: actual.toISOString(),
    isDelayed,
    daysDelayed,
    chargeAmount: Math.round(chargeAmount * 100) / 100,
    chargeType: type,
    chargeValue: value,
    description: isDelayed
      ? `Delayed return by ${daysDelayed} day${daysDelayed > 1 ? 's' : ''}`
      : 'On-time return'
  };
}

/**
 * Calculate delayed charges for all products in a booking
 */
export function calculateBookingDelayedCharges(
  products: Array<{
    id?: number;
    product_id?: number;
    code: string;
    name: string;
    rent_per_day: number;
    booked_to?: string;
    tracking?: {
      return_date?: string;
    };
    return_date?: string;
  }>,
  bookingBookedTo: string,
  settings: DelayedChargesSettings
): BookingDelayedCharges {
  const productCharges: ProductDelayedCharge[] = [];
  let totalCharge = 0;

  products.forEach(product => {
    // Get scheduled return date (product booked_to or booking booked_to)
    const scheduledReturnDate = product.booked_to || bookingBookedTo;

    // Get actual return date from tracking
    const actualReturnDate = product.tracking?.return_date || product.return_date || null;

    // Get product rent per day
    const productRentPerDay = parseFloat(String(product.rent_per_day)) || 0;

    if (scheduledReturnDate) {
      const charge = calculateProductDelayedCharges(
        scheduledReturnDate,
        actualReturnDate,
        productRentPerDay,
        settings
      );

      productCharges.push({
        ...charge,
        productId: product.id || product.product_id || 0,
        productCode: product.code,
        productName: product.name,
        rentPerDay: productRentPerDay,
        scheduledReturnDate,
        actualReturnDate
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
