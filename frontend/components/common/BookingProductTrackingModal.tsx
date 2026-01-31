'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/common';
import { productTrackingApi, ProductTracking } from '@/lib/productTrackingApi';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';

interface BookingProductTrackingModalProps {
  booking: Booking;
  onClose: () => void;
}

interface ProductTrackingState {
  id: number;
  name: string;
  code: string;
  size?: string;
  booked_from?: string;
  booked_to?: string;
  isPickedUp: boolean;
  isReturned: boolean;
  pickupTrackingRecord?: ProductTracking;
}

export function BookingProductTrackingModal({ booking, onClose }: BookingProductTrackingModalProps) {
  const [productsState, setProductsState] = useState<ProductTrackingState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeProducts();
  }, [booking]);

  async function initializeProducts() {
    try {
      setLoading(true);
      const products = Array.isArray(booking.products) ? booking.products : [];
      
      // Fetch tracking records for all products
      const trackingPromises = products.map(async (product: any) => {
        try {
          const response = await productTrackingApi.getByProductId(product.id);
          let data = [];
          if (response.data && Array.isArray(response.data.data)) {
            data = response.data.data;
          } else if (Array.isArray(response.data)) {
            data = response.data;
          }
          
          // Find pickup tracking for this booking
          const pickupTracking = data.find((t: ProductTracking) => 
            t.booking_id === booking.id && t.tracking_type === 'picked_by_customer'
          );
          
          console.log('Found pickup tracking for product', product.id, ':', pickupTracking);
          
          const isPickedUp = !!pickupTracking;
          const isReturned = pickupTracking?.status === 'returned';
          
          return {
            id: product.id,
            name: product.name,
            code: product.code,
            size: product.size,
            booked_from: product.booked_from || booking.booked_from,
            booked_to: product.booked_to || booking.booked_to,
            isPickedUp,
            isReturned,
            pickupTrackingRecord: pickupTracking ? {
              ...pickupTracking,
              id: pickupTracking.id // Ensure ID is explicitly set
            } : undefined,
          };
        } catch (error) {
          console.error(`Error fetching tracking for product ${product.id}:`, error);
          return {
            id: product.id,
            name: product.name,
            code: product.code,
            size: product.size,
            booked_from: product.booked_from || booking.booked_from,
            booked_to: product.booked_to || booking.booked_to,
            isPickedUp: false,
            isReturned: false,
          };
        }
      });

      const states = await Promise.all(trackingPromises);
      setProductsState(states);
    } catch (error) {
      console.error('Error initializing products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePickup(productIndex: number) {
    const product = productsState[productIndex];
    const newIsPickedUp = !product.isPickedUp;

    try {
      setLoading(true);

      if (newIsPickedUp) {
        // Mark as picked up - create tracking record with current date/time
        const currentDateTime = new Date().toISOString();
        const response = await productTrackingApi.create({
          product_id: product.id,
          booking_id: booking.id,
          product_code: product.code,
          tracking_type: 'picked_by_customer',
          notes: `Product picked up by ${booking.customer_name} on ${new Date().toLocaleString('en-GB')}`,
        });

        // Extract the tracking record from response (API returns { data: record })
        const trackingRecord = response.data.data || response.data;

        // Update state with actual pickup date/time
        const newProductsState = [...productsState];
        newProductsState[productIndex] = {
          ...product,
          isPickedUp: true,
          isReturned: false,
          pickupTrackingRecord: {
            id: trackingRecord.id,
            product_id: product.id,
            booking_id: booking.id,
            product_code: product.code,
            tracking_type: 'picked_by_customer',
            status: 'out',
            out_date: trackingRecord.out_date || currentDateTime,
            notes: trackingRecord.notes,
            created_at: trackingRecord.created_at || currentDateTime,
            updated_at: trackingRecord.updated_at || currentDateTime,
          } as ProductTracking,
        };
        setProductsState(newProductsState);
        
        // Update booking status (don't fail if this fails)
        try {
          await updateBookingStatus(newProductsState);
        } catch (statusError) {
          console.error('Warning: Booking status update failed, but pickup was recorded:', statusError);
          // Continue - pickup was recorded successfully
        }
        
      } else {
        // Uncheck pickup - remove tracking
        if (product.pickupTrackingRecord) {
          try {
            await productTrackingApi.delete(product.pickupTrackingRecord.id);

            // Update state
            const newProductsState = [...productsState];
            newProductsState[productIndex] = {
              ...product,
              isPickedUp: false,
              isReturned: false,
              pickupTrackingRecord: undefined,
            };
            setProductsState(newProductsState);
            
            // Update booking status (don't fail if this fails)
            try {
              await updateBookingStatus(newProductsState);
            } catch (statusError) {
              console.error('Warning: Booking status update failed, but pickup was removed:', statusError);
              // Continue - pickup was removed successfully
            }
          } catch (deleteError) {
            console.error('Error deleting pickup record:', deleteError);
            throw deleteError; // Re-throw to be caught by outer catch
          }
        }
      }
    } catch (error: any) {
      console.error('Error toggling product pickup status:', error);
      console.error('Error details:', error?.response?.data);
      console.error('Full error:', JSON.stringify(error, null, 2));
      
      const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';
      alert(`Error updating product pickup status: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleReturn(productIndex: number) {
    const product = productsState[productIndex];
    
    if (!product.isPickedUp) {
      alert('Product must be picked up first before marking as returned');
      return;
    }

    const newIsReturned = !product.isReturned;

    try {
      setLoading(true);

      if (newIsReturned) {
        // Mark as returned with current date/time
        if (product.pickupTrackingRecord) {
          console.log('Pickup tracking record:', product.pickupTrackingRecord);
          console.log('Tracking ID:', product.pickupTrackingRecord.id);
          
          if (!product.pickupTrackingRecord.id) {
            alert('Error: Tracking record ID is missing. Please try picking up the product again.');
            setLoading(false);
            return;
          }
          
          const returnDateTime = new Date().toISOString();
          await productTrackingApi.markReturned(
            product.pickupTrackingRecord.id,
            `Product returned by ${booking.customer_name} on ${new Date().toLocaleString('en-GB')}`
          );

          // Update state with actual return date/time
          const newProductsState = [...productsState];
          newProductsState[productIndex] = {
            ...product,
            isReturned: true,
            pickupTrackingRecord: {
              ...product.pickupTrackingRecord,
              status: 'returned',
              return_date: returnDateTime,
            },
          };
          setProductsState(newProductsState);
          
          // Update booking status (don't fail if this fails)
          try {
            await updateBookingStatus(newProductsState);
          } catch (statusError) {
            console.error('Warning: Booking status update failed, but return was recorded:', statusError);
            // Continue - return was recorded successfully
          }
        }
      } else {
        // Unmark as returned (mark as out again)
        alert('Once returned, a product cannot be unmarked. If customer took it again, please create a new booking.');
      }
    } catch (error: any) {
      console.error('Error toggling product return status:', error);
      console.error('Error details:', error?.response?.data);
      console.error('Full error:', JSON.stringify(error, null, 2));
      
      const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';
      alert(`Error updating product return status: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  async function updateBookingStatus(currentProductsState: ProductTrackingState[]) {
    try {
      const pickedUpCount = currentProductsState.filter(p => p.isPickedUp).length;
      const returnedCount = currentProductsState.filter(p => p.isReturned).length;
      const totalCount = currentProductsState.length;
      
      const today = new Date();
      const pickupDate = new Date(booking.booked_from);
      
      let newStatus = booking.status;
      
      // All products returned = Completed
      if (returnedCount === totalCount && pickedUpCount === totalCount) {
        newStatus = 'completed';
      }
      // Some products picked up or returned (partial) = In Progress (Partially Completed)
      else if (pickedUpCount > 0 && pickedUpCount < totalCount) {
        newStatus = 'in_progress'; // Partially Completed
      }
      // All picked up but not all returned = In Progress
      else if (pickedUpCount === totalCount && returnedCount < totalCount) {
        newStatus = 'in_progress';
      }
      // Some returned but not all = In Progress (Partially Completed)
      else if (returnedCount > 0 && returnedCount < totalCount) {
        newStatus = 'in_progress';
      }
      // Before pickup date, nothing picked up = Confirmed
      else if (today < pickupDate && pickedUpCount === 0) {
        newStatus = 'confirmed';
      }
      // After pickup date, nothing picked up = Pending
      else if (today >= pickupDate && pickedUpCount === 0) {
        newStatus = 'pending';
      }
      
      // Only update if status changed
      if (newStatus !== booking.status) {
        try {
          // Update with all required fields to avoid validation errors
          await bookingsApi.update(booking.id, {
            customer_name: booking.customer_name,
            customer_phone: booking.customer_phone || '',
            customer_address: booking.customer_address || '',
            booked_from: booking.booked_from.split('T')[0],
            booked_to: booking.booked_to.split('T')[0],
            status: newStatus,
          });
          console.log(`✅ Booking status updated to: ${newStatus}`);
          
          // Update local booking object
          booking.status = newStatus;
        } catch (updateError) {
          console.error('Failed to update booking status:', updateError);
          // Silently fail - product tracking is more important
        }
      }
    } catch (error) {
      console.error('Error in updateBookingStatus:', error);
      // Silently fail - don't interrupt the main operation
    }
  }

  const pickedUpCount = productsState.filter(p => p.isPickedUp).length;
  const returnedCount = productsState.filter(p => p.isReturned).length;
  const totalCount = productsState.length;
  const allPickedUp = pickedUpCount === totalCount;
  const partialPickup = pickedUpCount > 0 && pickedUpCount < totalCount;
  const allReturned = returnedCount === totalCount && pickedUpCount > 0;
  const partialReturn = returnedCount > 0 && returnedCount < pickedUpCount;


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📦 Product Pickup Tracking</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Booking Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Booking Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Customer</p>
              <p className="font-semibold text-gray-900">{booking.customer_name}</p>
            </div>
            <div>
              <p className="text-gray-600">Booking ID</p>
              <p className="font-semibold text-gray-900">#{booking.id}</p>
            </div>
            <div>
              <p className="text-gray-600">Pickup Date</p>
              <p className="font-semibold text-gray-900">
                {new Date(booking.booked_from).toLocaleDateString('en-GB')}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Return Date</p>
              <p className="font-semibold text-gray-900">
                {new Date(booking.booked_to).toLocaleDateString('en-GB')}
              </p>
            </div>
          </div>
        </div>

        {/* Booking Status Display */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Booking Status</h3>
              <div className="flex items-center gap-2">
                <span className={`px-4 py-2 text-sm font-bold rounded-full ${
                  allReturned ? 'bg-green-500 text-white' :
                  (partialPickup || partialReturn) ? 'bg-orange-500 text-white' :
                  allPickedUp ? 'bg-blue-500 text-white' :
                  new Date() < new Date(booking.booked_from) ? 'bg-yellow-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {allReturned ? '✅ COMPLETED' :
                   (partialPickup || partialReturn) ? '⚠️ PARTIALLY COMPLETED' :
                   allPickedUp ? '🔄 IN PROGRESS' :
                   new Date() < new Date(booking.booked_from) ? '✓ CONFIRMED' :
                   '❌ PENDING'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Auto-updated based on tracking</p>
            </div>
          </div>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Pickup Status */}
          <div className={`border-2 rounded-lg p-4 ${
            allPickedUp ? 'bg-blue-50 border-blue-300' : 
            partialPickup ? 'bg-yellow-50 border-yellow-300' : 
            'bg-gray-50 border-gray-300'
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {allPickedUp ? '✅ All Picked Up' : 
               partialPickup ? '⚠️ Partial Pickup' : 
               '⏳ Not Picked Up'}
            </h3>
            <div className="flex items-center justify-between">
              <p className="text-sm">Picked up by customer</p>
              <div className="text-2xl font-bold">
                {pickedUpCount}/{totalCount}
              </div>
            </div>
          </div>

          {/* Return Status */}
          <div className={`border-2 rounded-lg p-4 ${
            allReturned ? 'bg-green-50 border-green-300' : 
            partialReturn ? 'bg-orange-50 border-orange-300' : 
            pickedUpCount > 0 ? 'bg-red-50 border-red-300' :
            'bg-gray-50 border-gray-300'
          }`}>
            <h3 className="text-lg font-semibold mb-2">
              {allReturned ? '✅ All Returned' : 
               partialReturn ? '⚠️ Partial Return' : 
               pickedUpCount > 0 ? '❌ Not Returned' :
               '⏳ N/A'}
            </h3>
            <div className="flex items-center justify-between">
              <p className="text-sm">Returned by customer</p>
              <div className="text-2xl font-bold">
                {returnedCount}/{pickedUpCount || totalCount}
              </div>
            </div>
          </div>
        </div>

        {/* Products List */}
        <div className="space-y-3 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Product Tracking Checklist</h3>
          
          {/* Legend */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">How to use:</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div>✓ <strong>Picked Up:</strong> Customer received the product</div>
              <div>✓ <strong>Returned:</strong> Customer returned the product</div>
            </div>
          </div>
          
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading products...</div>
          ) : (
            productsState.map((product, index) => (
              <div
                key={product.id}
                className={`border-2 rounded-lg p-4 transition-all ${
                  product.isReturned
                    ? 'bg-green-50 border-green-300'
                    : product.isPickedUp
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-gray-300 hover:border-blue-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkboxes */}
                  <div className="pt-1 space-y-3">
                    {/* Pickup Checkbox */}
                    <div className="flex flex-col items-center">
                      <input
                        type="checkbox"
                        checked={product.isPickedUp}
                        onChange={() => handleTogglePickup(index)}
                        disabled={loading}
                        className="w-6 h-6 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                      />
                      <span className="text-xs text-gray-600 mt-1">Pickup</span>
                    </div>
                    
                    {/* Return Checkbox */}
                    <div className="flex flex-col items-center">
                      <input
                        type="checkbox"
                        checked={product.isReturned}
                        onChange={() => handleToggleReturn(index)}
                        disabled={loading || !product.isPickedUp}
                        className="w-6 h-6 text-green-600 rounded focus:ring-2 focus:ring-green-500 cursor-pointer disabled:opacity-50"
                      />
                      <span className="text-xs text-gray-600 mt-1">Return</span>
                    </div>
                  </div>

                  {/* Product Details */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 text-lg">
                          {product.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                            {product.code}
                          </span>
                          {product.size && (
                            <span className="ml-2">• Size: {product.size}</span>
                          )}
                        </p>
                        {/* Booking Dates for this Product */}
                        <div className="mt-2 flex gap-3 text-xs">
                          <div className="bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                            <span className="text-gray-600 font-semibold">Pickup Date: </span>
                            <span className="text-blue-700 font-bold">
                              {new Date(product.booked_from || booking.booked_from).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <div className="bg-orange-50 border border-orange-200 px-2 py-1 rounded">
                            <span className="text-gray-600 font-semibold">Return Date: </span>
                            <span className="text-orange-700 font-bold">
                              {new Date(product.booked_to || booking.booked_to).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Status Badge */}
                      <div className="flex flex-col gap-1">
                        <span
                          className={`px-3 py-1 text-xs font-bold rounded-full text-center ${
                            product.isReturned
                              ? 'bg-green-500 text-white'
                              : product.isPickedUp
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-300 text-gray-700'
                          }`}
                        >
                          {product.isReturned ? '✅ RETURNED' : 
                           product.isPickedUp ? '📤 WITH CUSTOMER' : 
                           '⏳ NOT PICKED UP'}
                        </span>
                      </div>
                    </div>

                    {/* Tracking Info */}
                    {product.pickupTrackingRecord && (
                      <div className="mt-3 bg-white border border-blue-200 rounded p-3 text-xs space-y-2">
                        <div>
                          <p className="text-gray-600">
                            <strong>Picked up:</strong>{' '}
                            {product.pickupTrackingRecord.out_date 
                              ? new Date(product.pickupTrackingRecord.out_date).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true
                                })
                              : 'Just now'}
                          </p>
                        </div>
                        {product.isReturned && product.pickupTrackingRecord.return_date && (
                          <div className="border-t border-green-200 pt-2">
                            <p className="text-green-700 font-semibold">
                              <strong>Returned:</strong>{' '}
                              {new Date(product.pickupTrackingRecord.return_date).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pending/Unreturned Products Lists */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Not Picked Up */}
          {partialPickup && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-900 mb-2">
                ⚠️ Not Picked Up ({totalCount - pickedUpCount})
              </h4>
              <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
                {productsState
                  .filter(p => !p.isPickedUp)
                  .map(p => (
                    <li key={p.id}>
                      {p.name} ({p.code}) {p.size && `- Size ${p.size}`}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          
          {/* With Customer (Not Returned) */}
          {pickedUpCount > returnedCount && pickedUpCount > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-2">
                ❌ With Customer - Not Returned ({pickedUpCount - returnedCount})
              </h4>
              <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                {productsState
                  .filter(p => p.isPickedUp && !p.isReturned)
                  .map(p => (
                    <li key={p.id}>
                      {p.name} ({p.code}) {p.size && `- Size ${p.size}`}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

