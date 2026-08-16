import { useState, useEffect, useRef, useCallback } from 'react';
import { bookingCancellationApi, bookingsApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { PaymentMethodInput } from './PaymentMethodInput';
import { SecurityAllocationSection, computeSecAllocationPreview } from './SecurityAllocationSection';
import type { EligibleSecProduct, SecAllocationEntry } from './SecurityAllocationSection';

interface Product {
  product_id: number;
  code: string;
  name: string;
  size?: string | null;
  rent: number;
  security_deposit: number;
  rent_paid: number;
  security_paid: number;
}

interface ProductPenalty extends Product {
  penalty_percentage: number;
  penalty_amount: number;
  refund_amount: number;
}

interface CancellationPreview {
  booking_id: number;
  booking_date: string;
  days_from_booking: number;
  penalty_percentage: number;
  policy: any;
  all_products: Product[];
  products_to_cancel: ProductPenalty[];
  total_cancelled_rent: number;
  total_cancelled_security: number;
  total_rent_paid: number;
  total_security_paid: number;
  total_penalty_amount: number;
  discount_reverted: number;
  total_refund_amount: number;
  refund_blocked: boolean;
  payment_action: 'collect' | 'refund' | 'blocked' | 'none';
  payment_difference: number;
  is_partial: boolean;
}

interface CancellationSummary {
  selected_count: number;
  total_count: number;
  selected_rent: number;
  selected_security: number;
  selected_rent_paid: number;
  selected_security_paid: number;
  total_penalty: number;
  discount_reverted: number;
  total_paid_for_selected: number;
  calculated_refund: number;
  remaining_dues_on_other_products: number;
  eligible_security_products: EligibleSecProduct[];
}

interface BookingCancellationProps {
  bookingId: number;
  bookingStatus: string;
  onCancellationComplete: () => void;
  userRole: 'admin' | 'salesman' | 'customer';
  userName: string;
  canCancel?: boolean;
  autoOpen?: boolean;
}

export function BookingCancellation({
  bookingId,
  bookingStatus,
  onCancellationComplete,
  userRole,
  userName,
  canCancel = true,
  autoOpen = false
}: BookingCancellationProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [preview, setPreview] = useState<CancellationPreview | null>(null);
  const [summary, setSummary] = useState<CancellationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [fetchingSummary, setFetchingSummary] = useState(false);

  // Product selection for partial cancellation
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);


  const [showConfirmation, setShowConfirmation] = useState(false);
  const [settlementAction, setSettlementAction] = useState<'adjust' | 'adjust_security'>('adjust');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [selectedSecProductIds, setSelectedSecProductIds] = useState<number[]>([]);

  // Editable final refund — admin can modify this value
  const [editedRefund, setEditedRefund] = useState<string>('');
  const [extraRefundNote, setExtraRefundNote] = useState('');

  // ── Settlement derived values (must be at top level — hooks rules) ───────────
  const settlementEligibleSecProducts: EligibleSecProduct[] = summary?.eligible_security_products ?? [];
  // Compute editedRefund as a number for settlement calculations
  const editedRefundNum = parseInt(editedRefund) || 0;
  const settlementDues = Math.min(editedRefundNum, summary?.remaining_dues_on_other_products ?? 0);
  const settlementRemainder = editedRefundNum - settlementDues;
  const settlementTotalSelectedCap = settlementEligibleSecProducts
    .filter(p => selectedSecProductIds.includes(p.bpId))
    .reduce((sum, p) => sum + p.remaining, 0);
  const settlementSecCredit = Math.min(settlementRemainder, settlementTotalSelectedCap);
  const settlementSecExcess = Math.max(0, settlementRemainder - settlementSecCredit);
  const { allocation: settlementSecAlloc, error: settlementSecAllocError } = computeSecAllocationPreview(
    settlementEligibleSecProducts, selectedSecProductIds, settlementSecCredit
  );

  // Auto-select sole eligible security product when in adjust_security mode
  useEffect(() => {
    if (
      settlementAction === 'adjust_security' &&
      settlementEligibleSecProducts.length === 1 &&
      selectedSecProductIds.length === 0
    ) {
      setSelectedSecProductIds([settlementEligibleSecProducts[0].bpId]);
    }
  }, [settlementAction, settlementEligibleSecProducts.length]);

  // Booking discount state
  const [bookingDiscount, setBookingDiscount] = useState(0);
  const [bookingDiscountInput, setBookingDiscountInput] = useState('');

  // Debounce timer ref
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canBeCancelled = bookingStatus !== 'pending' && bookingStatus !== 'cancelled' && bookingStatus !== 'completed' && bookingStatus !== 'discarded';

  // Build penalty overrides map from editing state
  // (removed — penalties are now read-only, always auto-calculated)

  // Fetch summary from backend whenever selection changes
  const fetchSummary = useCallback(async (
    productIds: number[]
  ) => {
    if (productIds.length === 0) {
      setSummary(null);
      return;
    }
    try {
      setFetchingSummary(true);
      const response = await bookingCancellationApi.calculateSummary({
        booking_id: bookingId,
        selected_product_ids: productIds,
      });
      setSummary(response.data);
      // Initialize editedRefund from backend-calculated value
      const calcRefund = response.data.calculated_refund;
      setEditedRefund(String(Math.max(0, calcRefund)));
    } catch (error: any) {
      console.error('Error fetching cancellation summary:', error);
    } finally {
      setFetchingSummary(false);
    }
  }, [bookingId]);

  // Debounced summary fetch — triggers when product selection changes
  useEffect(() => {
    if (!preview || !showCancelModal) return;

    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    summaryTimerRef.current = setTimeout(() => {
      fetchSummary(selectedProducts);
    }, 300);

    return () => {
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    };
  }, [selectedProducts, preview, showCancelModal, fetchSummary]);

  useEffect(() => {
    if (autoOpen && canBeCancelled) {
      handleOpenCancelModal();
    }
  }, [autoOpen, bookingId]);

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
      const response = await bookingCancellationApi.preview(bookingId);
      setPreview(response.data);

      // Initialize all eligible (non-security-paid) products as selected if none selected yet
      if (selectedProducts.length === 0 && response.data.all_products.length > 0) {
        const eligibleIds = response.data.all_products
          .filter((p: Product) => (p.security_paid ?? 0) === 0)
          .map((p: Product) => p.product_id);
        setSelectedProducts(eligibleIds);
      }

      // Fetch booking to get current final_discount
      try {
        const bookingResponse = await bookingsApi.getById(bookingId);
        const discount = parseFloat(bookingResponse.data?.final_discount || '0') || 0;
        setBookingDiscount(discount);
        setBookingDiscountInput(String(discount));
      } catch (e) {
        setBookingDiscount(0);
        setBookingDiscountInput('0');
      }
    } catch (error: any) {
      console.error('Error fetching cancellation preview:', error);
      toast.error(error.response?.data?.details || error.response?.data?.error || 'Failed to fetch cancellation details');
    } finally {
      setFetchingPreview(false);
    }
  }

  function handleProductSelection(productId: number, checked: boolean) {
    const product = preview?.all_products.find(p => p.product_id === productId);
    if (product && (product.security_paid ?? 0) > 0) return;
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  }

  function handleSelectAll(checked: boolean) {
    if (checked && preview) {
      const eligible = preview.all_products
        .filter(p => (p.security_paid ?? 0) === 0)
        .map(p => p.product_id);
      setSelectedProducts(eligible);
    } else {
      setSelectedProducts([]);
    }
  }

  function handleProceedToConfirmation() {
    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product to cancel');
      return;
    }

    if (!cancellationReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    // Always default to 'adjust' — it auto-adjusts dues first, then refunds the remainder
    setSettlementAction('adjust');
    // Reset security product selection when opening confirmation
    setSelectedSecProductIds([]);

    setShowConfirmation(true);
  }

  async function handleConfirmCancellation() {
    try {
      setLoading(true);

      // Compute extra_refund = editedRefund - calculatedRefund
      const calculatedRefund = summary?.calculated_refund ?? 0;
      const editedRefundValue = parseInt(editedRefund) || 0;
      const extraRefundAmount = editedRefundValue - calculatedRefund;

      const result = await bookingCancellationApi.cancel({
        booking_product_ids: selectedProducts,
        cancellation_reason: cancellationReason,
        cancelled_by: userName,
        extra_refund: extraRefundAmount,
        extra_refund_note: extraRefundNote || undefined,
        settlement_action: editedRefundValue > 0 ? settlementAction : 'none',
        payment_method: settlementAction === 'adjust' ? refundMethod : undefined,
        settlement_notes: extraRefundNote || undefined,
        security_product_ids: settlementAction === 'adjust_security' ? selectedSecProductIds : undefined,
      });

      const isPartial = preview && selectedProducts.length < preview.all_products.length;
      const refundAmt = result.data?.edited_refund || 0;
      const settlementMsg = result.data?.settlement?.transaction_recorded
        ? ` (Settlement of ₹${Math.floor(Math.abs(refundAmt)).toLocaleString('en-IN')} recorded)`
        : '';
      toast.success(
        (isPartial ? 'Products cancelled successfully' : 'Booking cancelled successfully') + settlementMsg
      );

      setShowCancelModal(false);
      setShowConfirmation(false);
      setCancellationReason('');
      setEditedRefund('');
      setExtraRefundNote('');
      setBookingDiscountInput('0');
      setBookingDiscount(0);
      setPreview(null);
      setSummary(null);
      setSelectedProducts([]);
      setSettlementAction('adjust');
      setRefundMethod('Cash');
      onCancellationComplete();
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.details || error.response?.data?.error || 'Failed to cancel booking');
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
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${canBeCancelled
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
                    setSettlementAction('refund');
                    setRefundMethod('Cash');
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
                          checked={(() => {
                            const eligible = preview.all_products.filter(p => (p.security_paid ?? 0) === 0);
                            return eligible.length > 0 && selectedProducts.length === eligible.length;
                          })()}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700">Select All</span>
                      </label>
                    </div>

                    <div className="space-y-2">
                      {preview.all_products.map((product) => {
                        const hasSecurityPaid = (product.security_paid ?? 0) > 0;
                        const isSelected = selectedProducts.includes(product.product_id);
                        const penaltyProduct = preview.products_to_cancel.find(p => p.product_id === product.product_id);
                        const calculatedPenalty = penaltyProduct ? penaltyProduct.penalty_amount : 0;
                        const currentPenalty = calculatedPenalty;

                        return (
                          <div
                            key={product.product_id}
                            className={`border rounded-lg p-4 ${
                              hasSecurityPaid
                                ? 'border-gray-200 bg-gray-100 opacity-60'
                                : isSelected
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={hasSecurityPaid}
                                onChange={(e) => handleProductSelection(product.product_id, e.target.checked)}
                                className="mt-1 w-5 h-5 text-blue-600 rounded disabled:cursor-not-allowed"
                              />
                              <div className="flex-1">
                                <div className="flex justify-between">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{product.name}</h4>
                                    <p className="text-sm text-gray-600">Code: {product.code}{product.size ? ` · Size: ${product.size}` : ''}</p>
                                    {hasSecurityPaid && (
                                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                        <span>🔒</span>
                                        <span>Security paid (₹{product.security_paid.toLocaleString('en-IN')}) — cannot cancel</span>
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-gray-600">
                                      Rent: ₹{(product.effective_rent || product.rent).toLocaleString('en-IN')}
                                      {product.effective_rent && product.effective_rent < product.rent && (
                                        <span className="text-xs text-gray-400 line-through ml-1">₹{product.rent.toLocaleString('en-IN')}</span>
                                      )}
                                    </p>
                                    <p className="text-sm text-gray-600">Security: ₹{product.security_deposit.toLocaleString('en-IN')}</p>
                                  </div>
                                </div>

                                {isSelected && (
                                  <div className="mt-3 bg-white rounded p-3 border border-gray-200">
                                    <div className="flex items-center justify-between">
                                      <label className="text-sm font-medium text-gray-700">
                                        Cancellation Penalty:
                                      </label>
                                      <span className="text-sm font-medium text-gray-900">
                                        ₹{Math.floor(currentPenalty).toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Auto-calculated: {preview.penalty_percentage}% of rent
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

                  {/* Summary — all values from backend */}
                  {selectedProducts.length > 0 && summary && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-yellow-900">Cancellation Summary (Live Preview)</h3>
                        {fetchingSummary && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                        )}
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Products to Cancel:</span>
                          <span className="font-medium text-yellow-900">{summary.selected_count} of {summary.total_count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Cancelled Product Rent:</span>
                          <span className="font-medium text-yellow-900">₹{Math.floor(summary.selected_rent).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Cancelled Product Security:</span>
                          <span className="font-medium text-yellow-900">₹{Math.floor(summary.selected_security).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-yellow-800">Cancellation Penalty ({preview.penalty_percentage}%):</span>
                          <span className="font-medium text-red-600">₹{Math.floor(summary.total_penalty).toLocaleString('en-IN')}</span>
                        </div>

                        <div className="border-t border-yellow-300 pt-2 mt-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Rent Paid (for cancelled products):</span>
                            <span>₹{Math.floor(summary.selected_rent_paid).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Security Paid (for cancelled products):</span>
                            <span>₹{Math.floor(summary.selected_security_paid).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Penalty Deduction:</span>
                            <span>- ₹{Math.floor(summary.total_penalty).toLocaleString('en-IN')}</span>
                          </div>
                          {summary.discount_reverted > 0 && (
                            <div className="flex justify-between text-xs text-red-600 font-medium">
                              <span>Discount Reverted:</span>
                              <span>- ₹{Math.floor(summary.discount_reverted).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs text-gray-600 font-medium mt-1">
                            <span>Calculated Refund:</span>
                            <span className={summary.calculated_refund < 0 ? 'text-red-600' : ''}>
                              ₹{Math.floor(summary.calculated_refund).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* Editable Final Refund */}
                        <div className="border-t border-yellow-300 pt-3 mt-1">
                          <div className="flex justify-between items-center">
                            <label className="font-semibold text-yellow-900">Final Refund Amount:</label>
                            <div className="flex items-center space-x-2">
                              <span className="text-yellow-800 font-medium">₹</span>
                              <input
                                type="number"
                                value={editedRefund}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  // Only allow integers
                                  if (val === '' || /^[0-9]+$/.test(val)) {
                                    setEditedRefund(val);
                                  }
                                }}
                                className="w-36 px-3 py-2 border border-yellow-400 rounded-md text-lg font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                                min="0"
                                max={summary.total_paid_for_selected}
                                step="1"
                              />
                            </div>
                          </div>
                          {(() => {
                            const editedVal = parseInt(editedRefund) || 0;
                            const extraRefundVal = editedVal - summary.calculated_refund;
                            const isNegativeExtra = extraRefundVal < 0;
                            return (
                              <>
                                {editedVal > summary.total_paid_for_selected && (
                                  <p className="text-xs text-red-600 mt-1">
                                    ⚠️ Cannot exceed total paid (₹{summary.total_paid_for_selected.toLocaleString('en-IN')})
                                  </p>
                                )}
                                {isNegativeExtra && (
                                  <p className="text-xs text-orange-600 mt-1">
                                    ⚠️ Refund is ₹{Math.abs(extraRefundVal).toLocaleString('en-IN')} less than calculated — reducing the refund doesn't make sense in most cases.
                                  </p>
                                )}
                                {extraRefundVal > 0 && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    Extra ₹{extraRefundVal.toLocaleString('en-IN')} added to calculated refund.
                                  </p>
                                )}
                              </>
                            );
                          })()}
                          {/* Note field for refund adjustments */}
                          {(() => {
                            const editedVal = parseInt(editedRefund) || 0;
                            const extraRefundVal = editedVal - summary.calculated_refund;
                            return extraRefundVal !== 0 ? (
                              <div className="mt-2">
                                <textarea
                                  value={extraRefundNote}
                                  onChange={(e) => setExtraRefundNote(e.target.value)}
                                  className="w-full px-3 py-2 border border-yellow-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                                  rows={2}
                                  placeholder="Reason for adjusting refund amount..."
                                />
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

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
                        setEditedRefund('');
                        setExtraRefundNote('');
                        setSettlementAction('adjust');
                        setRefundMethod('Cash');
                      }}
                      className="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleProceedToConfirmation}
                      disabled={selectedProducts.length === 0 || !cancellationReason.trim() || (parseInt(editedRefund) || 0) > (summary?.total_paid_for_selected ?? 0)}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 z-[60] overflow-y-auto">
          <div className="bg-white rounded-lg max-w-lg w-full my-8">
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

              {summary && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Products:</span>
                      <span className="font-medium">{summary.selected_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cancelled Product Rent:</span>
                      <span className="font-medium">₹{Math.floor(summary.selected_rent).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cancelled Product Security:</span>
                      <span className="font-medium">₹{Math.floor(summary.selected_security).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cancellation Penalty ({preview?.penalty_percentage || 0}%):</span>
                      <span className="font-medium text-red-600">₹{Math.floor(summary.total_penalty).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 pt-1">
                      <span>Rent Paid (for cancelled products):</span>
                      <span>₹{Math.floor(summary.selected_rent_paid).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Security Paid (for cancelled products):</span>
                      <span>₹{Math.floor(summary.selected_security_paid).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Penalty Deduction:</span>
                      <span>- ₹{Math.floor(summary.total_penalty).toLocaleString('en-IN')}</span>
                    </div>
                    {summary.discount_reverted > 0 && (
                      <div className="flex justify-between text-xs text-red-600 font-medium pt-1">
                        <span>Discount Reverted:</span>
                        <span>- ₹{Math.floor(summary.discount_reverted).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {(() => {
                      const editedVal = parseInt(editedRefund) || 0;
                      const extraRefundVal = editedVal - summary.calculated_refund;
                      return (
                        <>
                          {extraRefundVal !== 0 && (
                            <div className={`flex justify-between text-xs font-medium pt-1 ${extraRefundVal > 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                              <span>{extraRefundVal > 0 ? 'Extra Refund:' : 'Reduced Refund:'}</span>
                              <span>{extraRefundVal > 0 ? '+' : ''} ₹{extraRefundVal.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="font-semibold">Final Refund Amount:</span>
                      <span className="font-bold text-green-600">
                        ₹{(parseInt(editedRefund) || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Settlement — non-security auto-adjustment is mandatory; choice is for remainder only */}
              {summary && (() => {
                const editedRefundNum = parseInt(editedRefund) || 0;
                const eligibleSecProducts = settlementEligibleSecProducts;
                const dues = settlementDues;
                const remainder = editedRefundNum - dues;
                const hasEligibleSec = eligibleSecProducts.length > 0 && remainder > 0;
                const secCredit = settlementSecCredit;
                const secExcess = settlementSecExcess;
                const secAlloc = settlementSecAlloc;
                const secAllocError = settlementSecAllocError;

                return (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-green-900 mb-3">
                      Settle ₹{editedRefundNum.toLocaleString('en-IN')} refund
                    </h4>

                    {/* Mandatory auto-adjustment banner */}
                    {dues > 0 && (
                      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-sm">
                        <span className="text-blue-600 mt-0.5">⚡</span>
                        <div>
                          <p className="font-medium text-blue-800">
                            ₹{Math.floor(dues).toLocaleString('en-IN')} auto-adjusted against outstanding dues
                          </p>
                          <p className="text-xs text-blue-600 mt-0.5">
                            Applied automatically to pending charges on other products. No cash moves.
                          </p>
                        </div>
                      </div>
                    )}

                    {remainder <= 0 ? (
                      /* Full refund absorbed by dues — nothing left to decide */
                      <p className="text-sm text-green-700">
                        ✅ Entire refund applied against outstanding dues. No cash refund needed.
                      </p>
                    ) : (
                      /* User chooses what to do with the remainder */
                      <div className="space-y-3">
                        {dues > 0 && (
                          <p className="text-xs font-semibold text-green-800">
                            Remainder ₹{Math.floor(remainder).toLocaleString('en-IN')} — how would you like to settle this?
                          </p>
                        )}

                        {/* Option A — Refund remainder */}
                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settlementAction === 'adjust' ? 'border-green-400 bg-green-100' : 'border-green-200 bg-white hover:bg-green-50'}`}>
                          <input
                            type="radio"
                            name="cancel-settlement"
                            checked={settlementAction === 'adjust'}
                            onChange={() => setSettlementAction('adjust')}
                            className="mt-0.5 text-green-600"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-green-900 text-sm">
                              Refund ₹{Math.floor(remainder).toLocaleString('en-IN')} to customer
                            </p>
                            <p className="text-xs text-green-700 mt-0.5">Cash returned directly to the customer</p>
                            {settlementAction === 'adjust' && (
                              <div className="mt-3">
                                <PaymentMethodInput
                                  method={refundMethod}
                                  onMethodChange={setRefundMethod}
                                  notes={extraRefundNote}
                                  onNotesChange={setExtraRefundNote}
                                  amount={remainder}
                                  colorScheme="green"
                                  showQR={false}
                                />
                              </div>
                            )}
                          </div>
                        </label>

                        {/* Option B — Credit toward pending security */}
                        {hasEligibleSec && (
                          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${settlementAction === 'adjust_security' ? 'border-green-400 bg-green-100' : 'border-green-200 bg-white hover:bg-green-50'}`}>
                            <input
                              type="radio"
                              name="cancel-settlement"
                              checked={settlementAction === 'adjust_security'}
                              onChange={() => setSettlementAction('adjust_security')}
                              className="mt-0.5 text-green-600"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-green-900 text-sm">Credit toward pending security</p>
                              <p className="text-xs text-green-700 mt-0.5">
                                Apply ₹{Math.floor(remainder).toLocaleString('en-IN')} toward security due on other active products
                                {selectedSecProductIds.length > 0 && secExcess > 0
                                  ? ` — ₹${Math.floor(secExcess).toLocaleString('en-IN')} excess will be refunded`
                                  : ''}
                              </p>
                              {settlementAction === 'adjust_security' && (
                                <div className="mt-3 space-y-3">
                                  <SecurityAllocationSection
                                    securityAmount={secCredit || remainder}
                                    eligibleProducts={eligibleSecProducts}
                                    selectedIds={selectedSecProductIds}
                                    onSelectionChange={setSelectedSecProductIds}
                                    projectedAllocation={secAlloc}
                                    error={secAllocError}
                                  />
                                  {secExcess > 0 && (
                                    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3">
                                      <p className="text-xs font-semibold text-amber-800 mb-2">
                                        ₹{Math.floor(secExcess).toLocaleString('en-IN')} exceeds security capacity — refund this to customer
                                      </p>
                                      <PaymentMethodInput
                                        method={refundMethod}
                                        onMethodChange={setRefundMethod}
                                        notes={extraRefundNote}
                                        onNotesChange={setExtraRefundNote}
                                        amount={secExcess}
                                        colorScheme="green"
                                        showQR={false}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}




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
