import { useState, useEffect } from 'react';
import { bookingCancellationApi } from '@/lib/bookingCancellationApi';
import { toast } from '@/lib/toast';

interface CancellationPreview {
  booking_id: number;
  booking_date: string;
  days_from_booking: number;
  total_amount: number;
  total_paid: number;
  penalty_percentage: number;
  penalty_amount: number;
  refund_amount: number;
  policy: any;
}

interface BookingCancellationProps {
  bookingId: number;
  bookingStatus: string;
  onCancellationComplete: () => void;
  userRole?: 'admin' | 'salesman';
  userName?: string;
  canCancel?: boolean;
  autoOpen?: boolean; // New prop to auto-open modal
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

  // Check if booking can be cancelled
  const canBeCancelled = bookingStatus !== 'cancelled' && bookingStatus !== 'completed';

  // Auto-open modal if autoOpen prop is true
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
      console.log('Cancellation Preview:', response.data);
    } catch (error: any) {
      console.error('Error fetching cancellation preview:', error);
      toast.error(error.response?.data?.error || 'Failed to fetch cancellation details');
    } finally {
      setFetchingPreview(false);
    }
  }

  async function handleConfirmCancellation() {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    try {
      setLoading(true);
      
      await bookingCancellationApi.cancel({
        booking_id: bookingId,
        cancellation_reason: cancellationReason,
        cancelled_by: userName || 'system',
      });

      toast.success('Booking cancelled successfully');
      setShowCancelModal(false);
      setCancellationReason('');
      setPreview(null);
      onCancellationComplete();
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast.error(error.response?.data?.error || 'Failed to cancel booking');
    } finally {
      setLoading(false);
    }
  }

  function handleCloseModal() {
    setShowCancelModal(false);
    setCancellationReason('');
    setPreview(null);
  }

  // Don't show button if user doesn't have permission
  if (!canCancel) {
    return null;
  }

  return (
    <>
      {/* Cancel Booking Button */}
      <button
        onClick={handleOpenCancelModal}
        disabled={!canBeCancelled}
        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
          canBeCancelled
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {bookingStatus === 'cancelled' ? 'Already Cancelled' : 'Cancel Booking'}
      </button>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-red-600 to-red-700 text-white p-6 rounded-t-lg">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">⚠️ Cancel Booking</h2>
                <button
                  onClick={handleCloseModal}
                  className="text-white hover:text-gray-200 text-3xl font-bold transition-colors"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Warning Message */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-yellow-800">
                      Booking ID: <span className="font-bold">#{bookingId}</span>
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      This action cannot be undone. Cancellation penalties may apply based on the timing of cancellation.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cancellation Preview */}
              {fetchingPreview ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
                  <p className="mt-4 text-gray-600">Calculating cancellation details...</p>
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  {/* Cancellation Details */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <h3 className="font-semibold text-gray-800 text-lg mb-3">Cancellation Summary</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Booking Date</p>
                        <p className="font-semibold text-gray-900">
                          {new Date(preview.booking_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Days from Booking</p>
                        <p className="font-semibold text-gray-900">{preview.days_from_booking} days</p>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-700">Total Booking Amount:</span>
                        <span className="font-semibold text-gray-900">₹{preview.total_amount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Total Paid:</span>
                        <span className="font-semibold text-gray-900">₹{preview.total_paid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>Cancellation Penalty ({preview.penalty_percentage}%):</span>
                        <span className="font-semibold">-₹{preview.penalty_amount.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-gray-300 pt-2 flex justify-between text-lg">
                        <span className="font-bold text-gray-900">Refund Amount:</span>
                        <span className="font-bold text-green-600">₹{preview.refund_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Policy Info */}
                  {preview.policy && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-900 text-sm mb-2">📋 Cancellation Policy Applied</h4>
                      <div className="grid grid-cols-4 gap-2 text-xs text-blue-800">
                        <div>
                          <p className="font-medium">Within {preview.policy.days?.[0] || 3} days</p>
                          <p>{preview.policy.before_7_days || 0}% penalty</p>
                        </div>
                        <div>
                          <p className="font-medium">Within {preview.policy.days?.[1] || 5} days</p>
                          <p>{preview.policy.before_3_days || 0}% penalty</p>
                        </div>
                        <div>
                          <p className="font-medium">Within {preview.policy.days?.[2] || 7} days</p>
                          <p>{preview.policy.before_1_day || 0}% penalty</p>
                        </div>
                        <div>
                          <p className="font-medium">After {preview.policy.days?.[2] || 7} days</p>
                          <p>{preview.policy.on_booking_date || 0}% penalty</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Cancellation Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cancellation Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="Please provide a reason for cancellation (e.g., customer request, schedule conflict, etc.)"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 rounded-b-lg border-t border-gray-200">
              <button
                onClick={handleCloseModal}
                disabled={loading}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition-colors disabled:opacity-50"
              >
                Keep Booking
              </button>
              <button
                onClick={handleConfirmCancellation}
                disabled={loading || !cancellationReason.trim()}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

