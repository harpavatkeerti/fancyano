'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { getImageUrl } from '@/lib/imageHelper';
import { getCountryByCode, isValidPhoneNumber } from '@/lib/countryCodes';
import { PhoneInput } from '@/components/common';

interface CartItem {
  product: any;
  dateFrom: string;
  dateTo: string;
  specialNotes: string;
}

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [specialNotes, setSpecialNotes] = useState('');
  const [transportationRequired, setTransportationRequired] = useState<'yes' | 'no'>('no');
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash'>('upi');
  const [showUPIModal, setShowUPIModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerPhoneCountry, setCustomerPhoneCountry] = useState('IN');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [alternatePhoneCountry, setAlternatePhoneCountry] = useState('IN');
  
  // Measurements
  const [measurements, setMeasurements] = useState<{[key: number]: any}>({});

  useEffect(() => {
    // Load cart from localStorage
    const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
    setCartItems(cart);
  }, []);

  function removeFromCart(index: number) {
    const newCart = cartItems.filter((_, i) => i !== index);
    setCartItems(newCart);
    localStorage.setItem('salesman_cart', JSON.stringify(newCart));
  }

  function calculateSubtotal() {
    return cartItems.reduce((sum, item) => sum + item.product.rent_per_day, 0);
  }

  function calculateDeliveryFee() {
    return transportationRequired === 'yes' ? 199 : 0;
  }

  function calculateSecurityDeposit() {
    return 4000; // Fixed for now
  }

  function calculateTotal() {
    return calculateSubtotal() + calculateDeliveryFee();
  }

  async function handleConfirm() {
    if (!customerName || !customerPhone || !alternatePhone) {
      alert('Please fill in all customer details');
      return;
    }

    if (!isValidPhoneNumber(customerPhone, customerPhoneCountry)) {
      alert('Please enter a valid phone number');
      return;
    }

    if (!isValidPhoneNumber(alternatePhone, alternatePhoneCountry)) {
      alert('Please enter a valid alternate phone number');
      return;
    }

    if (paymentMethod === 'upi') {
      setShowUPIModal(true);
    } else {
      await createBooking();
    }
  }

  async function createBooking() {
    try {
      const country1 = getCountryByCode(customerPhoneCountry);
      const country2 = getCountryByCode(alternatePhoneCountry);

      // Create booking for each cart item
      for (const item of cartItems) {
        await bookingsApi.create({
          customer_name: customerName,
          customer_phone: `${country1?.callingCode}${customerPhone}`,
          alternate_phone: `${country2?.callingCode}${alternatePhone}`,
          customer_address: '',
          booking_date: new Date().toISOString().split('T')[0],
          booked_from: item.dateFrom,
          booked_to: item.dateTo,
          products: [{ id: item.product.id, booked_from: item.dateFrom, booked_to: item.dateTo }],
          total_amount: calculateTotal(),
          transportation_opted: transportationRequired === 'yes',
          status: 'confirmed',
          special_requirements: specialNotes,
        } as any);
      }

      // Clear cart
      localStorage.removeItem('salesman_cart');
      setShowUPIModal(false);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error creating booking');
    }
  }

  function handleMeasurementChange(productId: number, field: string, value: string) {
    setMeasurements({
      ...measurements,
      [productId]: {
        ...measurements[productId],
        [field]: value,
      },
    });
  }

  if (cartItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <button
            onClick={() => router.push('/salesman/products')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            Browse Products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Cart</h1>

      <div className="grid grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="col-span-2 space-y-4">
          {cartItems.map((item, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4">
              <div className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {getImageUrl(item.product.image) ? (
                  <img
                    src={getImageUrl(item.product.image)!}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-2xl">👔</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{item.product.name}</h3>
                <p className="text-sm text-gray-600">₹{Math.floor(item.product.rent_per_day)} / Day</p>
                <p className="text-sm text-red-600 mt-2">
                  Dates: {new Date(item.dateFrom).toLocaleDateString('en-GB')} To{' '}
                  {new Date(item.dateTo).toLocaleDateString('en-GB')}
                </p>
              </div>
              <button
                onClick={() => removeFromCart(index)}
                className="text-red-600 hover:text-red-800 flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* Special Notes */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Special Notes (if any):
            </label>
            <input
              type="text"
              placeholder="Enter"
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Transportation */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transportation Required?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={transportationRequired === 'yes'}
                  onChange={() => setTransportationRequired('yes')}
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={transportationRequired === 'no'}
                  onChange={() => setTransportationRequired('no')}
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>

          {/* Customer Contact Details */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Customer Contact Details</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name*"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="grid grid-cols-2 gap-4">
                <PhoneInput
                  label="Phone Number"
                  value={customerPhone}
                  countryCode={customerPhoneCountry}
                  onValueChange={(value) => {
                    setCustomerPhone(value);
                    // Check for duplicates
                    if (value && alternatePhone) {
                      const c1 = getCountryByCode(customerPhoneCountry);
                      const c2 = getCountryByCode(alternatePhoneCountry);
                      if (c1 && c2) {
                        const full1 = `${c1.callingCode}${value}`;
                        const full2 = `${c2.callingCode}${alternatePhone}`;
                        if (full1 === full2) {
                          alert('❌ Phone numbers cannot be the same');
                        }
                      }
                    }
                  }}
                  onCountryCodeChange={(code) => setCustomerPhoneCountry(code)}
                  required
                />
                <PhoneInput
                  label="Alternate Phone Number"
                  value={alternatePhone}
                  countryCode={alternatePhoneCountry}
                  onValueChange={(value) => {
                    setAlternatePhone(value);
                    // Check for duplicates
                    if (customerPhone && value) {
                      const c1 = getCountryByCode(customerPhoneCountry);
                      const c2 = getCountryByCode(alternatePhoneCountry);
                      if (c1 && c2) {
                        const full1 = `${c1.callingCode}${customerPhone}`;
                        const full2 = `${c2.callingCode}${value}`;
                        if (full1 === full2) {
                          alert('❌ Phone numbers cannot be the same');
                        }
                      }
                    }
                  }}
                  onCountryCodeChange={(code) => setAlternatePhoneCountry(code)}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">₹{calculateSubtotal().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="font-medium">₹{calculateDeliveryFee()}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total Payable Now:</span>
                <span>₹{calculateTotal().toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Security Deposit</span>
                <span className="font-medium">₹{calculateSecurityDeposit().toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-500 italic">
                Note: The Payment of Security will only be collected at the time of delivery
              </p>
            </div>

            {/* Payment Method */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Payment</h3>
              <div className="space-y-2">
                <label className="flex items-center justify-between p-3 border border-gray-300 rounded-lg cursor-pointer bg-red-50 border-red-200">
                  <span>UPI</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'upi'}
                    onChange={() => setPaymentMethod('upi')}
                    className="ml-2"
                  />
                </label>
                <label className="flex items-center justify-between p-3 border border-gray-300 rounded-lg cursor-pointer bg-red-50 border-red-200">
                  <span>Cash</span>
                  <input
                    type="radio"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                    className="ml-2"
                  />
                </label>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              CONFIRM
            </button>
          </div>
        </div>
      </div>

      {/* UPI Payment Modal */}
      {showUPIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Pay using UPI</h3>
            <p className="text-center text-gray-700 mb-4">Amount Due: ₹{calculateTotal().toLocaleString()}</p>
            <div className="flex justify-center mb-4">
              <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                <span className="text-4xl">QR Code</span>
              </div>
            </div>
            <p className="text-center text-gray-600 mb-4">OR</p>
            <p className="text-center text-sm text-gray-700 mb-6">
              Pay on UPI ID: <span className="font-semibold">fancyano@oksbi</span>
            </p>
            <button
              onClick={() => createBooking()}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
            >
              Confirm Payment
            </button>
          </div>
        </div>
      )}

      {/* Confirmation & Measurements Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl mx-4 my-8">
            <div className="flex items-center mb-6">
              <svg className="w-8 h-8 text-green-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">Your Payment Has Been Confirmed</h2>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm your measurements to confirm your order
            </h3>

            {cartItems.map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex gap-4 mb-4">
                  <div className="w-16 h-20 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                    {getImageUrl(item.product.image) && (
                      <img src={getImageUrl(item.product.image)!} alt={item.product.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{item.product.name}</h4>
                    <p className="text-sm text-gray-600">₹{Math.floor(item.product.rent_per_day)} / Day</p>
                    <p className="text-sm text-red-600">
                      Dates: {new Date(item.dateFrom).toLocaleDateString('en-GB')} To {new Date(item.dateTo).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <input type="text" placeholder="Waist (in inches)" className="px-3 py-2 border rounded" />
                  <input type="text" placeholder="Bust (in inches)" className="px-3 py-2 border rounded" />
                  <input type="text" placeholder="Chest (in inches)" className="px-3 py-2 border rounded" />
                  <input type="text" placeholder="Shoulder (in inches)" className="px-3 py-2 border rounded" />
                </div>
              </div>
            ))}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => router.push('/salesman/my-bookings')}
                className="flex-1 px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                CANCEL
              </button>
              <button
                onClick={() => router.push('/salesman/my-bookings')}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

