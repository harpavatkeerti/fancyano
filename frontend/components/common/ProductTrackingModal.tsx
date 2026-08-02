'use client';

import { productTrackingApi, ProductTracking, TrackingStatus, TRACKING_STATUS_LABELS, MANUAL_TRACKING_STATUSES, productsApi } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Button } from '@/components/common';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

import { Product } from '@/types';

interface ProductTrackingModalProps {
  onClose: () => void;
  productId?: number;
  productCode?: string;
  bookingId?: number;
  size?: string | null;
}

export function ProductTrackingModal({ onClose, productId, productCode, bookingId, size }: ProductTrackingModalProps) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<ProductTracking[]>([]);
  /** The latest tracking record — determines which panel to show */
  const [currentRecord, setCurrentRecord] = useState<ProductTracking | null>(null);
  const [trackingType, setTrackingType] = useState<TrackingStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productId) {
      fetchProductById(productId);
    } else if (productCode) {
      searchByCode(productCode);
    }
  }, [productId, productCode]);

  async function fetchProductById(id: number) {
    try {
      const response = await productsApi.getAll();
      const product = response.data.find((p: Product) => p.id === id);
      if (product) {
        setSelectedProduct(product);
        await fetchTrackingHistory(id);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    }
  }

  async function fetchTrackingHistory(id: number) {
    try {
      const histResponse = await productTrackingApi.getByProductId(id);
      let data: ProductTracking[] = [];
      if (histResponse.data && Array.isArray(histResponse.data.data)) {
        data = histResponse.data.data;
      } else if (Array.isArray(histResponse.data)) {
        data = histResponse.data;
      }
      setTrackingHistory(data);

      // Fetch current (latest) record separately
      const currentResponse = await productTrackingApi.getCurrentStatus(id);
      const current = currentResponse.data?.data ?? null;
      setCurrentRecord(current);
    } catch (error) {
      console.error('Error fetching tracking history:', error);
      setTrackingHistory([]);
      setCurrentRecord(null);
    }
  }

  async function searchByCode(code: string) {
    try {
      setLoading(true);
      const response = await productsApi.getAll();
      const product = response.data.find((p: Product) => p.code.toLowerCase() === code.toLowerCase());
      if (product) {
        setSelectedProduct(product);
        await fetchTrackingHistory(product.id);
      } else {
        toast.error(`Product with code "${code}" not found`);
      }
    } catch (error) {
      console.error('Error searching product:', error);
    } finally {
      setLoading(false);
    }
  }

  /** Submit: send product out for manual work (dry clean / alteration / repair / other) */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct || !trackingType) return;

    if (trackingType === 'other_work' && !notes.trim()) {
      alert('Please describe the work for "Other Work" type');
      return;
    }

    try {
      setLoading(true);
      await productTrackingApi.create({
        product_id: selectedProduct.id,
        booking_id: bookingId,
        product_code: selectedProduct.code,
        size: size || undefined,
        tracking_status: trackingType as TrackingStatus,
        notes: notes || undefined,
      });

      setTrackingType('');
      setNotes('');
      await fetchTrackingHistory(selectedProduct.id);
      toast.success('Product tracked out successfully.');
    } catch (error: any) {
      console.error('Error creating tracking record:', error);
      toast.error(error?.response?.data?.error || 'Error creating tracking record');
    } finally {
      setLoading(false);
    }
  }

  /** Mark returned: insert a new in_house row via PATCH /:id/return */
  async function handleMarkReturned() {
    if (!currentRecord) return;
    if (!selectedProduct) return;
    const confirmed = await confirm({
      title: 'Mark as Returned',
      message: 'Mark this product as returned (back in house)?',
      confirmText: 'Mark Returned',
      cancelText: 'Cancel',
      confirmColor: 'green',
    });
    if (!confirmed) return;

    try {
      setLoading(true);
      await productTrackingApi.markReturned(currentRecord.id);
      await fetchTrackingHistory(selectedProduct.id);
      toast.success('Product marked as returned — now In House.');
    } catch (error) {
      console.error('Error marking as returned:', error);
      toast.error('Error marking product as returned');
    } finally {
      setLoading(false);
    }
  }

  /** Derive effective tracking status — null / undefined means in_house */
  const currentStatus: TrackingStatus = (currentRecord?.tracking_status as TrackingStatus) || 'in_house';
  const isManualOut = MANUAL_TRACKING_STATUSES.includes(currentStatus);
  const isPickedByCustomer = currentStatus === 'picked_by_customer';
  const isInHouse = currentStatus === 'in_house';

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            🗺️ Product Tracking{size ? ` · Size ${size}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl font-bold">
            ×
          </button>
        </div>

        {/* Product Info */}
        {selectedProduct && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Product Name</p>
                <p className="text-base font-semibold text-gray-900">{selectedProduct.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Product Code</p>
                <p className="text-base font-semibold text-gray-900 font-mono">{selectedProduct.code}</p>
              </div>
              {selectedProduct.size && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Size</p>
                  <p className="text-base font-semibold text-gray-900">{selectedProduct.size}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Current Status</p>
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${isInHouse ? 'bg-green-100 text-green-800' :
                    isPickedByCustomer ? 'bg-blue-100 text-blue-800' :
                      'bg-orange-100 text-orange-800'
                  }`}>
                  {TRACKING_STATUS_LABELS[currentStatus]}
                </span>
              </div>
            </div>
          </div>
        )}

        {selectedProduct && (
          <>
            {/* === Panel 1: IN HOUSE — show "Track Out" form === */}
            {isInHouse && (
              <form onSubmit={handleSubmit} className="bg-white border border-gray-300 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">📋 Send Product Out For Work</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Purpose of Movement*
                    </label>
                    <div className="space-y-2">
                      {MANUAL_TRACKING_STATUSES.map((status) => (
                        <label
                          key={status}
                          className="flex items-center p-3 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="trackingType"
                            value={status}
                            checked={trackingType === status}
                            onChange={(e) => setTrackingType(e.target.value as TrackingStatus)}
                            className="mr-3 w-4 h-4"
                          />
                          <span className="text-gray-900">{TRACKING_STATUS_LABELS[status]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {trackingType === 'other_work' ? 'Describe the work*' : 'Notes (Optional)'}
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder={trackingType === 'other_work' ? 'Enter work description...' : 'Any additional information...'}
                      required={trackingType === 'other_work'}
                    />
                  </div>

                  <Button type="submit" disabled={loading || !trackingType}>
                    {loading ? 'Processing...' : '✓ Track Out'}
                  </Button>
                </div>
              </form>
            )}

            {/* === Panel 2: WITH CUSTOMER — show booking link, no Mark Returned === */}
            {isPickedByCustomer && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-5 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">👤</span>
                  <h3 className="text-lg font-semibold text-blue-800">Product is with a Customer</h3>
                </div>
                <p className="text-sm text-blue-700 mb-3">
                  This product has been picked up by a customer and is currently out on a booking.
                  It will be marked as <strong>In House</strong> automatically when the booking product is completed.
                </p>
                {currentRecord?.booking_ref_id && (
                  <a
                    href={`/bookings/${currentRecord.booking_ref_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    🔗 Check Booking #{currentRecord.booking_ref_id}
                  </a>
                )}
                {currentRecord?.notes && (
                  <p className="text-xs text-blue-600 mt-3">
                    <strong>Notes:</strong> {currentRecord.notes}
                  </p>
                )}
              </div>
            )}

            {/* === Panel 3: OUT FOR WORK — show current status + Mark Returned === */}
            {isManualOut && currentRecord && (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-5 mb-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">⚠️</span>
                      <h3 className="text-lg font-semibold text-orange-800">
                        Product is Out — {TRACKING_STATUS_LABELS[currentStatus]}
                      </h3>
                    </div>

                    {currentRecord.notes && (
                      <p className="text-sm text-gray-700 mb-2">
                        <strong>Notes:</strong> {currentRecord.notes}
                      </p>
                    )}

                    <p className="text-xs text-gray-500 mt-2">
                      <strong>Since:</strong>{' '}
                      {new Date(currentRecord.created_at).toLocaleString()}
                    </p>
                  </div>

                  <button
                    onClick={handleMarkReturned}
                    disabled={loading}
                    className="ml-4 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loading ? '...' : '✓ Mark Returned'}
                  </button>
                </div>
              </div>
            )}

            {/* Tracking History */}
            {Array.isArray(trackingHistory) && trackingHistory.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                <h3 className="text-base font-semibold text-gray-700 mb-3">📜 Tracking History</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {trackingHistory.map((record) => {
                    const status = (record.tracking_status as TrackingStatus) || 'in_house';
                    const colorMap: Record<TrackingStatus, string> = {
                      in_house: 'bg-green-100 text-green-800',
                      picked_by_customer: 'bg-blue-100 text-blue-800',
                      going_to_dry_clean: 'bg-yellow-100 text-yellow-800',
                      alternation_related_work: 'bg-purple-100 text-purple-800',
                      repair: 'bg-orange-100 text-orange-800',
                      other_work: 'bg-gray-100 text-gray-700',
                    };
                    return (
                      <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-3 flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colorMap[status]}`}>
                              {TRACKING_STATUS_LABELS[status]}
                            </span>
                          </div>
                          {record.notes && (
                            <p className="text-xs text-gray-500">{record.notes}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap ml-3 text-right">
                          <span className="block">{new Date(record.created_at).toLocaleDateString('en-GB')}</span>
                          <span className="block">{new Date(record.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
    {ConfirmDialog}
    </>
  );
}
