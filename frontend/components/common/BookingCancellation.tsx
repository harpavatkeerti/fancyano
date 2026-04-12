import { useState, useEffect, useRef, useCallback } from 'react';
import { bookingCancellationApi, paymentTransactionsApi } from '@/lib/api';
import { toast } from '@/lib/toast';
import { PaymentMethodInput } from './PaymentMethodInput';

interface Product {
  product_id: number;
  code: string;
  name: string;
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
  total_refund_amount: number;
  payment_action: 'collect' | 'refund' | 'none';
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
  extra_refund: number;
  refund_amount: number;
  payment_action: 'collect' | 'refund' | 'none';
  payment_difference: number;
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
  const [summary, setSummary] = useState<CancellationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [fetchingSummary, setFetchingSummary] = useState(false);

  // Product selection for partial cancellation
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);

  // Manual penalty editing
  const [editingPenalties, setEditingPenalties] = useState<{ [key: number]: string }>({});

  // Extra refund fields
  const [extraRefund, setExtraRefund] = useState<string>('');
  const [extraRefundNote, setExtraRefundNote] = useState('');

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [settlementAction, setSettlementAction] = useState<'refund' | 'adjust' | 'collect'>('refund');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [remainingDues, setRemainingDues] = useState(0);

  // Debounce timer ref
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canBeCancelled = bookingStatus !== 'pending' && bookingStatus !== 'cancelled' && bookingStatus !== 'completed';

  // Build penalty overrides map from editing state
  const getPenaltyOverrides = useCallback((): { [key: number]: number } => {
    const overrides: { [key: number]: number } = {};
    for (const [productId, value] of Object.entries(editingPenalties)) {
      if (value === '') {
        overrides[parseInt(productId)] = 0;
      } else {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          overrides[parseInt(productId)] = parsed;
        }
      }
    }
    return overrides;
  }, [editingPenalties]);

  // Fetch summary from backend whenever selection, penalties, or extra refund changes
  const fetchSummary = useCallback(async (
    productIds: number[],
    penalties: { [key: number]: number },
    extra: number
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
        penalty_overrides: Object.keys(penalties).length > 0 ? penalties : undefined,
        extra_refund: extra || undefined,
      });
      setSummary(response.data);
    } catch (error: any) {
      console.error('Error fetching cancellation summary:', error);
    } finally {
      setFetchingSummary(false);
    }
  }, [bookingId]);

  // Debounced summary fetch — triggers whenever inputs change
  useEffect(() => {
    if (!preview || !showCancelModal) return;

    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    summaryTimerRef.current = setTimeout(() => {
      const extra = parseFloat(extraRefund) || 0;
      fetchSummary(selectedProducts, getPenaltyOverrides(), extra);
    }, 300);

    return () => {
      if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
    };
  }, [selectedProducts, editingPenalties, extraRefund, preview, showCancelModal, fetchSummary, getPenaltyOverrides]);

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

      // Initialize all products as selected if none selected yet
      if (selectedProducts.length === 0 && response.data.all_products.length > 0) {
        const allIds = response.data.all_products.map((p: Product) => p.product_id);
        setSelectedProducts(allIds);
      }

      // Fetch payment summary to know remaining dues
      try {
        const summaryResponse = await paymentTransactionsApi.getSummary(bookingId);
        const balance = summaryResponse.data?.totals?.balance || 0;
        setRemainingDues(Math.max(0, balance));
      } catch (e) {
        setRemainingDues(0);
      }
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

  // Get display penalty for a product (user-edited or backend default)
  function getDisplayPenalty(product: ProductPenalty): number | string {
    const editedValue = editingPenalties[product.product_id];
    if (editedValue !== undefined) return editedValue;
    return product.penalty_amount;
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

    // Set default settlement action based on payment scenario
    if (summary?.payment_action === 'collect') {
      setSettlementAction('collect');
    } else if (summary?.refund_amount && summary.refund_amount > 0) {
      setSettlementAction('refund');
    }

    setShowConfirmation(true);
  }

  async function handleConfirmCancellation() {
    try {
      setLoading(true);

      // Build penalty overrides for products that were manually edited
      const penaltyOverrides = getPenaltyOverrides();
      const cancellationPenalties = Object.entries(penaltyOverrides).map(([id, amount]) => ({
        booking_product_id: parseInt(id),
        penalty_amount: amount,
      }));

      const result = await bookingCancellationApi.cancel({
        booking_product_ids: selectedProducts,
        cancellation_penalties: cancellationPenalties.length > 0 ? cancellationPenalties : undefined,
        cancellation_reason: cancellationReason,
        cancelled_by: userName || 'system',
        settlement_action: settlementAction,
        payment_method: (settlementAction === 'refund' || settlementAction === 'collect') ? refundMethod : undefined,
        settlement_notes: extraRefundNote || undefined,
      });

      const isPartial = preview && selectedProducts.length < preview.all_products.length;
      const actionLabel = settlementAction === 'refund' ? 'Refund' : settlementAction === 'collect' ? 'Payment' : 'Adjustment';
      const diffAmount = result.data?.total_diff_amount || 0;
      const settlementMsg = result.data?.settlement?.transaction_recorded
        ? ` (${actionLabel} of ₹${Math.floor(Math.abs(diffAmount)).toLocaleString('en-IN')} recorded)`
        : '';
      toast.success(
        (isPartial ? 'Products cancelled successfully' : 'Booking cancelled successfully') + settlementMsg
      );

      setShowCancelModal(false);
      setShowConfirmation(false);
      setCancellationReason('');
      setExtraRefund('');
      setExtraRefundNote('');
      setPreview(null);
      setSummary(null);
      setSelectedProducts([]);
      setEditingPenalties({});
      setSettlementAction('refund');
      setRefundMethod('Cash');
      setRemainingDues(0);
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
                        const calculatedPenalty = penaltyProduct ? penaltyProduct.penalty_amount : 0;
                        const currentPenalty = penaltyProduct ? getDisplayPenalty(penaltyProduct) : calculatedPenalty;

                        return (
                          <div
                            key={product.product_id}
                            className={`border rounded-lg p-4 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
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
                          {summary.extra_refund > 0 && (
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Extra Refund:</span>
                              <span>+ ₹{Math.floor(summary.extra_refund).toLocaleString('en-IN')}</span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-yellow-300 pt-2 mt-1">
                          <div className="flex justify-between items-center">
                            {summary.payment_action === 'collect' ? (
                              <>
                                <span className="font-semibold text-yellow-900">Amount to Collect:</span>
                                <span className="font-bold text-orange-600 text-lg">
                                  ₹{Math.floor(summary.payment_difference).toLocaleString('en-IN')}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-semibold text-yellow-900">Refund Amount:</span>
                                <span className="font-bold text-green-600 text-lg">
                                  ₹{Math.floor(summary.refund_amount).toLocaleString('en-IN')}
                                </span>
                              </>
                            )}
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
                        setEditingPenalties({});
                        setExtraRefund('');
                        setExtraRefundNote('');
                        setSettlementAction('refund');
                        setRefundMethod('Cash');
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
                    {summary.extra_refund > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Extra Refund:</span>
                        <span>+ ₹{Math.floor(summary.extra_refund).toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      {summary.payment_action === 'collect' ? (
                        <>
                          <span className="font-semibold">Amount to Collect:</span>
                          <span className="font-bold text-orange-600">
                            ₹{Math.floor(summary.payment_difference).toLocaleString('en-IN')}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">Refund Amount:</span>
                          <span className="font-bold text-green-600">
                            ₹{Math.floor(summary.refund_amount).toLocaleString('en-IN')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Settlement Options — context-aware based on remaining dues */}
              {summary && summary.refund_amount > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold text-green-900 mb-3">
                    How would you like to handle the ₹{Math.floor(summary.refund_amount).toLocaleString('en-IN')} refund?
                  </h4>

                  {remainingDues <= 0 ? (
                    // No dues — single option, just pick refund method
                    <div className="p-3 rounded-lg border border-green-300 bg-green-100">
                      <p className="font-medium text-green-900">Refund to Customer</p>
                      <p className="text-xs text-green-700 mb-3">
                        ₹{Math.floor(summary.refund_amount).toLocaleString('en-IN')} will be returned to the customer (no outstanding dues)
                      </p>
                      <PaymentMethodInput
                        method={refundMethod}
                        onMethodChange={setRefundMethod}
                        notes={extraRefundNote}
                        onNotesChange={setExtraRefundNote}
                        amount={summary.refund_amount}
                        colorScheme="green"
                        showQR={false}
                      />
                    </div>
                  ) : (
                    // Has dues — two smart options
                    <div className="space-y-3">
                      <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-green-200 hover:bg-green-100 transition-colors">
                        <input
                          type="radio"
                          name="settlement"
                          value="refund"
                          checked={settlementAction === 'refund'}
                          onChange={() => setSettlementAction('refund')}
                          className="mt-1 w-4 h-4 text-green-600"
                        />
                        <div>
                          <p className="font-medium text-green-900">Refund ₹{Math.floor(summary.refund_amount).toLocaleString('en-IN')} to Customer</p>
                          <p className="text-xs text-green-700">Return the full amount directly to the customer</p>
                        </div>
                      </label>
                      <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-green-200 hover:bg-green-100 transition-colors">
                        <input
                          type="radio"
                          name="settlement"
                          value="adjust"
                          checked={settlementAction === 'adjust'}
                          onChange={() => setSettlementAction('adjust')}
                          className="mt-1 w-4 h-4 text-green-600"
                        />
                        <div>
                          <p className="font-medium text-green-900">
                            Adjust ₹{Math.floor(Math.min(summary.refund_amount, remainingDues)).toLocaleString('en-IN')} against dues
                            {summary.refund_amount > remainingDues && (
                              <span> + Refund ₹{Math.floor(summary.refund_amount - remainingDues).toLocaleString('en-IN')} to customer</span>
                            )}
                          </p>
                          <p className="text-xs text-green-700">
                            Clears ₹{Math.floor(Math.min(summary.refund_amount, remainingDues)).toLocaleString('en-IN')} of outstanding dues
                            {summary.refund_amount > remainingDues
                              ? `, remaining ₹${Math.floor(summary.refund_amount - remainingDues).toLocaleString('en-IN')} refunded`
                              : ''}
                          </p>
                        </div>
                      </label>

                      {/* Refund method — shown for both options when there's money going back */}
                      {(settlementAction === 'refund' || summary.refund_amount > remainingDues) && (
                        <div className="mt-2 pt-3 border-t border-green-200">
                          <PaymentMethodInput
                            method={refundMethod}
                            onMethodChange={setRefundMethod}
                            notes={extraRefundNote}
                            onNotesChange={setExtraRefundNote}
                            amount={summary.refund_amount > remainingDues ? summary.refund_amount - remainingDues : summary.refund_amount}
                            colorScheme="green"
                            showQR={false}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Collection — when penalty exceeds per-product paid */}
              {summary && summary.payment_action === 'collect' && summary.payment_difference > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold text-orange-900 mb-3">
                    Collect ₹{Math.floor(summary.payment_difference).toLocaleString('en-IN')} cancellation penalty from customer
                  </h4>
                  <PaymentMethodInput
                    method={refundMethod}
                    onMethodChange={setRefundMethod}
                    notes={extraRefundNote}
                    onNotesChange={setExtraRefundNote}
                    amount={summary.payment_difference}
                    colorScheme="orange"
                  />
                </div>
              )}

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
