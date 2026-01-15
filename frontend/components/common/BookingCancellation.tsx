import { useState, useEffect } from 'react';
import { bookingCancellationApi } from '@/lib/bookingCancellationApi';
import { toast } from '@/lib/toast';

interface Product {
  product_id: number;
  code: string;
  name: string;
  rent: number;
  security_deposit: number;
}

interface ProductPenalty extends Product {
  penalty_percentage: number;
  penalty_amount: number;
}

interface CancellationPreview {
  booking_id: number;
  booking_date: string;
  days_from_booking: number;
  penalty_percentage: number;
  policy: any;
  all_products: Product[];
  products_to_cancel: ProductPenalty[];
  total_cancelled_rent_required?: number;
  total_cancelled_security_required?: number;
  total_penalty_amount: number;
  difference_of_amount_paid?: number;
  remaining_rent_required?: number;
  advance_paid?: number;
  base_refund: number;
  total_paid: number;
  total_refunded: number;
  net_paid: number;
  paid_rent?: number;
  paid_security_deposit?: number;
  payment_action: 'collect' | 'refund' | 'none';
  payment_difference: number;
  is_partial: boolean;
}

interface BookingCancellationProps {
  bookingId: number;
  bookingStatus: string;
  onCancellationComplete: () => void;
  userRole?: 'admin' | 'salesman';
  userName?: string;
  canCancel?: boolean;
  autoOpen?: boolean;
}

export function BookingCancellation({
  bookingId,
  bookingStatus,
  onCancellationComplete,
  userRole = 'admin',
  userName,
  canCancel = true,
  autoOpen = false
}: BookingCancellationProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  
  // Product selection for partial cancellation
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  
  // Manual penalty editing
  const [editingPenalties, setEditingPenalties] = useState<{[key: number]: string}>({});
  
  // Extra refund fields
  const [extraRefund, setExtraRefund] = useState<string>('');
  const [extraRefundNote, setExtraRefundNote] = useState('');
  
  const [showConfirmation, setShowConfirmation] = useState(false);

  const canBeCancelled = bookingStatus !== 'cancelled' && bookingStatus !== 'completed';

  useEffect(() => {
    if (autoOpen && canBeCancelled) {
      handleOpenCancelModal();
    }
  }, [autoOpen, bookingId]);

  // Note: Removed auto-refetch on selection changes
  // The component now calculates totals dynamically based on selected products
  // without needing to call the API again

  async function handleOpenCancelModal() {
    if (!canBeCancelled) {
      toast.error('This booking cannot be cancelled');
      return;
    }

    setShowCancelModal(true);
    await fetchCancellationPreview();
  }

  async function fetchCancellationPreview() {
    try {
      setFetchingPreview(true);
      const response = await bookingCancellationApi.preview(bookingId, selectedProducts.length > 0 ? selectedProducts : undefined);
      setPreview(response.data);
      
      // Initialize all products as selected if none selected yet
      if (selectedProducts.length === 0 && response.data.all_products.length > 0) {
        setSelectedProducts(response.data.all_products.map((p: Product) => p.product_id));
      }
      
      console.log('Cancellation Preview:', response.data);
    } catch (error: any) {
      console.error('Error fetching cancellation preview:', error);
      toast.error(error.response?.data?.error || 'Failed to fetch cancellation details');
    } finally {
      setFetchingPreview(false);
    }
  }

  function handleProductSelection(productId: number, checked: boolean) {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  }

  function handleSelectAll(checked: boolean) {
    if (checked && preview) {
      setSelectedProducts(preview.all_products.map(p => p.product_id));
    } else {
      setSelectedProducts([]);
    }
  }

  function handlePenaltyEdit(productId: number, value: string) {
    setEditingPenalties(prev => ({
      ...prev,
      [productId]: value
    }));
  }

  function getProductPenalty(product: ProductPenalty): number {
    const editedValue = editingPenalties[product.product_id];
    if (editedValue !== undefined) {
      // If user has edited the field (even if empty), use their value
      // Empty string or invalid number = 0
      if (editedValue === '') return 0;
      return parseFloat(editedValue) || 0;
    }
    // No edit made - use default calculated penalty
    return product.penalty_amount;
  }

  function getTotalPenalty(): number {
    if (!preview) return 0;
    // Only calculate penalty for SELECTED products
    return preview.products_to_cancel
      .filter(product => selectedProducts.includes(product.product_id))
      .reduce((sum, product) => {
        return sum + getProductPenalty(product);
      }, 0);
  }

  function getExtraRefundAmount(): number {
    const amount = parseFloat(extraRefund);
    return isNaN(amount) ? 0 : amount;
  }

  function getTotalCancelledRent(): number {
    if (!preview) return 0;
    // Use the backend-calculated rent amount (which accounts for what was actually paid)
    // If we're cancelling all products, use the preview's total_cancelled_rent directly
    // If partial cancellation, calculate proportionally
    if (selectedProducts.length === 0) return 0;
    
    const allProductIds = preview.all_products.map(p => p.product_id);
    const allSelected = allProductIds.every(id => selectedProducts.includes(id));
    
    if (allSelected) {
      // All products selected - use backend's calculated value
      return preview.total_cancelled_rent || 0;
    } else {
      // Partial selection - calculate proportionally based on what backend said is available
      const totalRentRequired = preview.all_products.reduce((sum, p) => sum + p.rent, 0);
      const selectedRentRequired = preview.all_products
        .filter(p => selectedProducts.includes(p.product_id))
        .reduce((sum, p) => sum + p.rent, 0);
      
      if (totalRentRequired === 0) return 0;
      
      // Calculate ratio and apply to paid rent
      const ratio = selectedRentRequired / totalRentRequired;
      const paidRent = preview.paid_rent || 0;
      return paidRent * ratio;
    }
  }

  function getTotalCancelledSecurity(): number {
    if (!preview) return 0;
    // Use the backend-calculated security amount (which accounts for what was actually paid)
    // If we're cancelling all products, use the preview's total_cancelled_security directly
    // If partial cancellation, calculate proportionally
    if (selectedProducts.length === 0) return 0;
    
    const allProductIds = preview.all_products.map(p => p.product_id);
    const allSelected = allProductIds.every(id => selectedProducts.includes(id));
    
    if (allSelected) {
      // All products selected - use backend's calculated value
      return preview.total_cancelled_security || 0;
    } else {
      // Partial selection - calculate proportionally based on what backend said is available
      const totalSecurityRequired = preview.all_products.reduce((sum, p) => sum + p.security_deposit, 0);
      const selectedSecurityRequired = preview.all_products
        .filter(p => selectedProducts.includes(p.product_id))
        .reduce((sum, p) => sum + p.security_deposit, 0);
      
      if (totalSecurityRequired === 0) return 0;
      
      // Calculate ratio and apply to paid security
      const ratio = selectedSecurityRequired / totalSecurityRequired;
      const paidSecurity = preview.paid_security_deposit || 0;
      return paidSecurity * ratio;
    }
  }

  function getTotalCancelledRentRequired(): number {
    if (!preview) return 0;
    // Get the required rent for selected products
    return preview.all_products
      .filter(p => selectedProducts.includes(p.product_id))
      .reduce((sum, p) => sum + p.rent, 0);
  }

  function getRemainingProductRent(): number {
    if (!preview) return 0;
    // Calculate remaining product rent (products NOT being cancelled)
    const totalRent = preview.all_products.reduce((sum, p) => sum + p.rent, 0);
    const cancelledRent = getTotalCancelledRentRequired();
    return totalRent - cancelledRent;
  }

  function getFinalRefundAmount(): number {
    if (!preview) return 0;
    
    // CORRECT FORMULA: Refund = Total Booking Rent - (Remaining Due + Penalty + Remaining Product Rent)
    const totalBookingRent = preview.all_products.reduce((sum, p) => sum + p.rent, 0);
    const advancePaid = preview.net_paid || 0;
    const remainingDue = Math.max(0, totalBookingRent - advancePaid);
    const penalty = getTotalPenalty();
    const remainingProductRent = getRemainingProductRent();
    const extra = getExtraRefundAmount();
    
    return Math.floor(totalBookingRent - (remainingDue + penalty + remainingProductRent) + extra);
  }

  // Removed - now auto-recalculates on product selection changes

  function handleProceedToConfirmation() {
    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product to cancel');
      return;
    }
    
    if (!cancellationReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    setShowConfirmation(true);
  }

  async function handleConfirmCancellation() {
    try {
      setLoading(true);
      
      // Prepare per-product penalties (only for manually edited ones)
      const perProductPenalties = preview?.products_to_cancel
        .filter(p => editingPenalties[p.product_id] !== undefined)
        .map(p => ({
          product_id: p.product_id,
          penalty_amount: getProductPenalty(p),
          notes: `Manual penalty for ${p.name} (${p.code}) | Reason: ${cancellationReason}`
        })) || [];
      
      const extraRefundAmount = getExtraRefundAmount();
      
      await bookingCancellationApi.cancel({
        booking_id: bookingId,
        product_ids: selectedProducts,
        per_product_penalties: perProductPenalties.length > 0 ? perProductPenalties : undefined,
        cancellation_reason: cancellationReason,
        cancelled_by: userName || 'system',
        extra_refund: extraRefundAmount > 0 ? extraRefundAmount : undefined,
        extra_refund_note: extraRefundNote.trim() || undefined,
      });

      const isPartial = preview && selectedProducts.length < preview.all_products.length;
      toast.success(isPartial ? 'Products cancelled successfully' : 'Booking cancelled successfully');
      
      setShowCancelModal(false);
      setShowConfirmation(false);
      setCancellationReason('');
      setExtraRefund('');
      setExtraRefundNote('');
      setPreview(null);
      setSelectedProducts([]);
      setEditingPenalties({});
      onCancellationComplete();
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setLoading(false);
    }
  }

  if (!canCancel) {
    return null;
  }

  return (
    <>
      {!autoOpen && (
        <button
          onClick={handleOpenCancelModal}
          disabled={!canBeCancelled}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            canBeCancelled
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Cancel Booking
        </button>
      )}

      {/* Main Cancellation Modal */}
      {showCancelModal && !showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Cancel Booking</h2>
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setPreview(null);
                    setSelectedProducts([]);
                    setEditingPenalties({});
                    setExtraRefund('');
                    setExtraRefundNote('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {fetchingPreview ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading cancellation details...</p>
                </div>
              ) : preview ? (
                <div className="space-y-6">
                  {/* Policy Information */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Cancellation Policy</h3>
                    <div className="text-sm text-blue-800">
                      <p>Booking Date: <span className="font-medium">{new Date(preview.booking_date).toLocaleDateString('en-GB')}</span></p>
                      <p>Days from booking: <span className="font-medium">{preview.days_from_booking} days</span></p>
                      <p>Penalty Rate: <span className="font-medium">{preview.penalty_percentage}%</span> of rental amount</p>
                    </div>
                  </div>

                  {/* Product Selection */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-gray-900">Select Products to Cancel</h3>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedProducts.length === preview.all_products.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">Select All</span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      {preview.all_products.map((product) => {
                        const isSelected = selectedProducts.includes(product.product_id);
                        const penaltyProduct = preview.products_to_cancel.find(p => p.product_id === product.product_id);
                        const calculatedPenalty = penaltyProduct ? (product.rent * preview.penalty_percentage / 100) : 0;
                        const currentPenalty = penaltyProduct ? getProductPenalty(penaltyProduct) : calculatedPenalty;
                        
                        return (
                          <div
                            key={product.product_id}
                            className={`border rounded-lg p-4 ${
                              isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleProductSelection(product.product_id, e.target.checked)}
                                className="mt-1 w-5 h-5 text-blue-600 rounded"
                              />
                              <div className="flex-1">
                                <div className="flex justify-between">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{product.name}</h4>
                                    <p className="text-sm text-gray-600">Code: {product.code}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-gray-600">Rent: ₹{product.rent.toLocaleString('en-IN')}</p>
                                    <p className="text-sm text-gray-600">Security: ₹{product.security_deposit.toLocaleString('en-IN')}</p>
                                  </div>
                                </div>
                                
                                {isSelected && (
                                  <div className="mt-3 bg-white rounded p-3 border border-gray-200">
                                    <div className="flex items-center justify-between">
                                      <label className="text-sm font-medium text-gray-700">
                                        Cancellation Penalty:
                                      </label>
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs text-gray-500">₹</span>
                                        <input
                                          type="number"
                                          value={editingPenalties[product.product_id] ?? currentPenalty}
                                          onChange={(e) => handlePenaltyEdit(product.product_id, e.target.value)}
                                          className="w-32 px-3 py-1 border border-gray-300 rounded-md text-sm"
                                          step="0.01"
                                          min="0"
                                        />
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Auto-calculated: ₹{calculatedPenalty.toFixed(2)} ({preview.penalty_percentage}% of rent)
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary */}
                  {selectedProducts.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h3 className="font-semibold text-yellow-900 mb-3">Cancellation Summary (Live Preview)</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Products to Cancel:</span>
                          <span className="font-medium text-yellow-900">{selectedProducts.length} of {preview.all_products.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Total Rent (Cancelled):</span>
                          <span className="font-medium text-yellow-900">₹{Math.floor(getTotalCancelledRentRequired()).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Total Security (Cancelled):</span>
                          <span className="font-medium text-yellow-900">₹{Math.floor(getTotalCancelledSecurity()).toLocaleString('en-IN')}</span>
                        </div>
                        {preview && preview.paid_security_deposit !== undefined && preview.paid_security_deposit === 0 && (
                          <div className="text-xs text-gray-600 italic ml-4">
                            Note: Only ₹{Math.floor(preview.paid_security_deposit || 0).toLocaleString('en-IN')} security was paid
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Cancellation Penalty:</span>
                          <span className="font-medium text-red-600">-₹{Math.floor(getTotalPenalty()).toLocaleString('en-IN')}</span>
                        </div>
                        {getRemainingProductRent() > 0 && (
                          <div className="flex justify-between">
                            <span className="text-yellow-800">Remaining Product Rent:</span>
                            <span className="font-medium text-blue-600">-₹{Math.floor(getRemainingProductRent()).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {getExtraRefundAmount() > 0 && (
                          <div className="flex justify-between">
                            <span className="text-yellow-800">Extra Refund:</span>
                            <span className="font-medium text-green-600">+₹{Math.floor(getExtraRefundAmount()).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="border-t border-yellow-300 pt-2 mt-2">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-yellow-900">Final Refund Amount:</span>
                            <span className="font-bold text-green-600 text-lg">
                              ₹{Math.floor(getFinalRefundAmount()).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Extra Refund Section */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3">Additional Refund (Optional)</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                          Extra Refund Amount
                        </label>
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-800">₹</span>
                          <input
                            type="number"
                            value={extraRefund}
                            onChange={(e) => setExtraRefund(e.target.value)}
                            className="flex-1 px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-blue-800 mb-2">
                          Note/Reason for Extra Refund
                        </label>
                        <textarea
                          value={extraRefundNote}
                          onChange={(e) => setExtraRefundNote(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          placeholder="e.g., Goodwill gesture, damaged product compensation..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Cancellation Reason */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cancellation Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Enter reason for cancellation..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setShowCancelModal(false);
                        setPreview(null);
                        setSelectedProducts([]);
                        setEditingPenalties([]);
                        setExtraRefund('');
                        setExtraRefundNote('');
                      }}
                      className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProceedToConfirmation}
                      disabled={selectedProducts.length === 0 || !cancellationReason.trim()}
                      className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                      Proceed to Confirm
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmation && preview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                  <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Cancellation</h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to cancel {selectedProducts.length} product(s)?
                  This action cannot be undone.
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Products:</span>
                    <span className="font-medium">{selectedProducts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Rent (Cancelled):</span>
                    <span className="font-medium">₹{Math.floor(getTotalCancelledRentRequired()).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Security (Cancelled):</span>
                    <span className="font-medium">₹{Math.floor(getTotalCancelledSecurity()).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cancellation Penalty:</span>
                    <span className="font-medium text-red-600">-₹{Math.floor(getTotalPenalty()).toLocaleString('en-IN')}</span>
                  </div>
                  {getRemainingProductRent() > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Remaining Product Rent:</span>
                      <span className="font-medium text-blue-600">-₹{Math.floor(getRemainingProductRent()).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {getExtraRefundAmount() > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Extra Refund:</span>
                      <span className="font-medium text-green-600">+₹{Math.floor(getExtraRefundAmount()).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-semibold">Final Refund:</span>
                    <span className="font-bold text-green-600">
                      ₹{Math.floor(getFinalRefundAmount()).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 rounded-lg font-medium transition-colors"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirmCancellation}
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {loading ? 'Processing...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
