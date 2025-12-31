'use client';

import { useState, useEffect } from 'react';
import { Button, Input, QRScanner } from '@/components/common';
import { productTrackingApi, ProductTracking } from '@/lib/productTrackingApi';
import { productsApi } from '@/lib/api';
import { Product } from '@/types';

interface ProductTrackingModalProps {
  onClose: () => void;
  productId?: number;
  productCode?: string;
  bookingId?: number;
}

export function ProductTrackingModal({ onClose, productId, productCode, bookingId }: ProductTrackingModalProps) {
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [searchCode, setSearchCode] = useState(productCode || '');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [trackingType, setTrackingType] = useState('');
  const [notes, setNotes] = useState('');
  const [trackingHistory, setTrackingHistory] = useState<ProductTracking[]>([]);
  const [activeTracking, setActiveTracking] = useState<ProductTracking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (productId) {
      fetchProductById(productId);
      fetchTrackingHistory(productId);
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
        setSearchCode(product.code);
      }
    } catch (error) {
      console.error('Error fetching product:', error);
    }
  }

  async function fetchTrackingHistory(id: number) {
    try {
      const response = await productTrackingApi.getByProductId(id);
      console.log('API Response:', response);
      
      // Handle different response structures
      let data = [];
      if (response.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      } else if (Array.isArray(response.data)) {
        data = response.data;
      }
      
      console.log('Fetched tracking data:', data);
      setTrackingHistory(data);
      
      // Separate active (out) tracking records
      const active = data.filter((t: ProductTracking) => t.status === 'out');
      console.log('Active tracking records:', active);
      setActiveTracking(active);
    } catch (error) {
      console.error('Error fetching tracking history:', error);
      setTrackingHistory([]);
      setActiveTracking([]);
    }
  }

  async function searchByCode(code: string) {
    try {
      setLoading(true);
      const response = await productsApi.getAll();
      const product = response.data.find((p: Product) => p.code.toLowerCase() === code.toLowerCase());
      
      if (product) {
        setSelectedProduct(product);
        setSearchCode(product.code);
        await fetchTrackingHistory(product.id);
      } else {
        alert(`❌ Product with code "${code}" not found`);
      }
    } catch (error) {
      console.error('Error searching product:', error);
      setTrackingHistory([]);
      setActiveTracking([]);
      alert('Error searching for product');
    } finally {
      setLoading(false);
    }
  }

  function handleQRScan(code: string) {
    setSearchCode(code);
    searchByCode(code);
    setShowQRScanner(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedProduct) {
      alert('Please search and select a product first');
      return;
    }

    // Check if product is already OUT
    if (activeTracking && activeTracking.length > 0) {
      alert('❌ This product is already OUT! Please mark it as RETURNED before sending it out again.');
      return;
    }

    if (!trackingType) {
      alert('Please select a tracking type');
      return;
    }

    if (trackingType === 'other_work' && !notes) {
      alert('Please describe the work for "Other Work" type');
      return;
    }

    try {
      setLoading(true);
      
      const createResponse = await productTrackingApi.create({
        product_id: selectedProduct.id,
        booking_id: bookingId,
        product_code: selectedProduct.code,
        tracking_type: trackingType,
        work_description: trackingType === 'other_work' ? notes : undefined,
        notes: trackingType === 'other_work' ? notes : notes,
      });

      console.log('Tracking created:', createResponse);

      // Directly add the new tracking to state immediately
      const newTracking: ProductTracking = {
        id: createResponse.data.id,
        product_id: selectedProduct.id,
        booking_id: bookingId,
        product_code: selectedProduct.code,
        tracking_type: trackingType as any,
        work_description: trackingType === 'other_work' ? notes : undefined,
        status: 'out',
        out_date: new Date().toISOString(),
        notes: notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Update state immediately
      setActiveTracking([...activeTracking, newTracking]);
      setTrackingHistory([...trackingHistory, newTracking]);
      
      // Reset form
      setTrackingType('');
      setNotes('');
      
      alert('✅ Product tracking record created successfully! See "Current Status" above.');
    } catch (error) {
      console.error('Error creating tracking record:', error);
      alert('Error creating tracking record');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkReturned(trackingId: number) {
    if (!confirm('Mark this product as returned?')) return;

    try {
      setLoading(true);
      await productTrackingApi.markReturned(trackingId);
      
      // Immediately update state - remove from active, add to history
      const updatedActive = activeTracking.filter(t => t.id !== trackingId);
      setActiveTracking(updatedActive);
      
      const returnedRecord = activeTracking.find(t => t.id === trackingId);
      if (returnedRecord) {
        const updated = { ...returnedRecord, status: 'returned' as const, return_date: new Date().toISOString() };
        setTrackingHistory(trackingHistory.map(t => t.id === trackingId ? updated : t));
      }
      
      alert('✅ Product marked as returned! Current Status section cleared.');
    } catch (error) {
      console.error('Error marking as returned:', error);
      alert('Error marking product as returned');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📦 Product Tracking</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-3xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Product Search Section */}
        {!selectedProduct && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">🔍 Search Product</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      searchByCode(searchCode);
                    }
                  }}
                  placeholder="Enter product code..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => searchByCode(searchCode)}
                disabled={loading}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Search
              </button>
              <button
                onClick={() => setShowQRScanner(true)}
                className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <span className="text-xl">📷</span>
                Scan QR
              </button>
            </div>
          </div>
        )}

        {/* Selected Product Display with Current Status */}
        {selectedProduct && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-semibold text-gray-800">✅ Selected Product</h3>
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setSearchCode('');
                    setTrackingHistory([]);
                    setActiveTracking([]);
                    setTrackingType('');
                    setNotes('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  🔄 Change Product
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Product Name</p>
                  <p className="text-base font-semibold text-gray-900">{selectedProduct.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Product Code</p>
                  <p className="text-base font-semibold text-gray-900 font-mono">{selectedProduct.code}</p>
                </div>
                {selectedProduct.size && (
                  <div>
                    <p className="text-sm text-gray-600">Size</p>
                    <p className="text-base font-semibold text-gray-900">{selectedProduct.size}</p>
                  </div>
                )}
              </div>
            </div>


            {/* Current Status - Active Tracking Records */}
            {activeTracking && activeTracking.length > 0 ? (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4 mb-6 shadow-lg">
                <h3 className="text-lg font-semibold text-orange-800 mb-3 flex items-center">
                  <span className="text-2xl mr-2">⚠️</span> Current Status - Product is OUT
                </h3>
                <div className="space-y-3">
                  {activeTracking.map((record) => (
                    <div key={record.id} className="bg-white border-2 border-orange-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-3 py-1 text-sm font-bold bg-orange-500 text-white rounded-full">
                              📤 OUT
                            </span>
                            <span className="text-base font-semibold text-gray-900">
                              {record.tracking_type === 'going_to_dry_clean' && '🧼 At Dry Clean'}
                              {record.tracking_type === 'alternation_related_work' && '✂️ For Alternation'}
                              {record.tracking_type === 'repair' && '🔧 Under Repair'}
                              {record.tracking_type === 'other_work' && '📝 Other Work'}
                              {record.tracking_type === 'picked_by_customer' && '👤 With Customer'}
                            </span>
                          </div>
                          
                          {record.work_description && (
                            <p className="text-sm text-gray-700 mb-2">
                              <strong>Work:</strong> {record.work_description}
                            </p>
                          )}
                          
                          {record.customer_name && (
                            <p className="text-sm text-gray-600 mb-1">
                              <strong>Customer:</strong> {record.customer_name}
                            </p>
                          )}
                          
                          <p className="text-xs text-gray-500 mt-2">
                            <strong>Out Since:</strong> {new Date(record.out_date).toLocaleString()}
                          </p>
                          
                          {record.notes && (
                            <p className="text-sm text-gray-600 mt-2">
                              <strong>Notes:</strong> {record.notes}
                            </p>
                          )}
                        </div>
                        
                        <button
                          onClick={() => handleMarkReturned(record.id)}
                          className="ml-4 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                          ✓ Mark Returned
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Tracking Form */}
        {selectedProduct && (
          <form onSubmit={handleSubmit} className="bg-white border border-gray-300 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">📋 Track Product Movement</h3>
              {activeTracking && activeTracking.length > 0 && (
                <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">
                  ⚠️ PRODUCT ALREADY OUT
                </span>
              )}
            </div>
            
            <div className="space-y-4">
              {/* Warning if product is already out */}
              {activeTracking && activeTracking.length > 0 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🚫</span>
                    <div>
                      <p className="font-bold text-red-800 mb-1">Cannot Track - Product Already OUT!</p>
                      <p className="text-sm text-red-700">
                        This product is currently out for another purpose. Please mark it as RETURNED above before tracking it for a new purpose.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tracking Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Purpose of Movement*
                </label>
                <div className="space-y-2">
                  <label className={`flex items-center p-3 border border-gray-300 rounded-lg ${activeTracking.length > 0 ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-gray-50 cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="trackingType"
                      value="going_to_dry_clean"
                      checked={trackingType === 'going_to_dry_clean'}
                      onChange={(e) => setTrackingType(e.target.value)}
                      disabled={activeTracking.length > 0}
                      className="mr-3 w-4 h-4"
                    />
                    <span className="text-gray-900">🧼 Going to Dry Clean</span>
                  </label>
                  <label className={`flex items-center p-3 border border-gray-300 rounded-lg ${activeTracking.length > 0 ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-gray-50 cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="trackingType"
                      value="alternation_related_work"
                      checked={trackingType === 'alternation_related_work'}
                      onChange={(e) => setTrackingType(e.target.value)}
                      disabled={activeTracking.length > 0}
                      className="mr-3 w-4 h-4"
                    />
                    <span className="text-gray-900">✂️ Alternation Related Work</span>
                  </label>
                  <label className={`flex items-center p-3 border border-gray-300 rounded-lg ${activeTracking.length > 0 ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-gray-50 cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="trackingType"
                      value="repair"
                      checked={trackingType === 'repair'}
                      onChange={(e) => setTrackingType(e.target.value)}
                      disabled={activeTracking.length > 0}
                      className="mr-3 w-4 h-4"
                    />
                    <span className="text-gray-900">🔧 Repair</span>
                  </label>
                  <label className={`flex items-center p-3 border border-gray-300 rounded-lg ${activeTracking.length > 0 ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'hover:bg-gray-50 cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="trackingType"
                      value="other_work"
                      checked={trackingType === 'other_work'}
                      onChange={(e) => setTrackingType(e.target.value)}
                      disabled={activeTracking.length > 0}
                      className="mr-3 w-4 h-4"
                    />
                    <span className="text-gray-900">📝 Other Work</span>
                  </label>
                </div>
              </div>

              {/* Work Description / Notes - Single Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {trackingType === 'other_work' ? 'Describe your work here*' : 'Notes (Optional)'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={activeTracking.length > 0}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  rows={3}
                  placeholder={trackingType === 'other_work' ? 'Enter work description...' : 'Any additional information...'}
                  required={trackingType === 'other_work'}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={loading || activeTracking.length > 0}>
                  {loading ? 'Processing...' : activeTracking.length > 0 ? '🚫 Product Already Out' : '✓ Track Product Out'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Tracking History - Only show completed/returned records */}
        {selectedProduct && Array.isArray(trackingHistory) && trackingHistory.filter(r => r.status === 'returned').length > 0 && (
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">📜 Past Tracking History (Completed)</h3>
            <div className="space-y-3">
              {Array.isArray(trackingHistory) && trackingHistory.filter(r => r.status === 'returned').map((record) => (
                <div
                  key={record.id}
                  className="bg-white border-2 border-green-300 rounded-lg p-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          ✅ RETURNED
                        </span>
                        <span className="text-sm font-semibold text-gray-700">
                          {record.tracking_type === 'going_to_dry_clean' && '🧼 Dry Clean'}
                          {record.tracking_type === 'alternation_related_work' && '✂️ Alternation'}
                          {record.tracking_type === 'repair' && '🔧 Repair'}
                          {record.tracking_type === 'other_work' && '📝 Other Work'}
                          {record.tracking_type === 'picked_by_customer' && '👤 Picked by Customer'}
                        </span>
                      </div>
                      
                      {record.work_description && (
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Work:</strong> {record.work_description}
                        </p>
                      )}
                      
                      {record.customer_name && (
                        <p className="text-sm text-gray-600 mb-1">
                          <strong>Customer:</strong> {record.customer_name}
                        </p>
                      )}
                      
                      <p className="text-xs text-gray-500">
                        <strong>Out:</strong> {new Date(record.out_date).toLocaleString()}
                      </p>
                      
                      <p className="text-xs text-gray-500">
                        <strong>Returned:</strong> {new Date(record.return_date!).toLocaleString()}
                      </p>
                      
                      {record.notes && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Notes:</strong> {record.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </div>
  );
}

