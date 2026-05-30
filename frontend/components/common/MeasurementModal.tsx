'use client';

import { useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { getImageUrl } from '@/lib/imageHelper';
import { toast } from '@/lib/toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isFemaleClothing(productName: string): boolean {
  const femaleTypes = ['Lehenga', 'Gown', 'Gowns', 'Girlish Crop Top'];
  return femaleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
}

export function isMaleClothing(productName: string): boolean {
  const maleTypes = ['Sherwani', 'Suit', 'Kurta Pajama', 'Indo Western'];
  return maleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeasurementModalProps {
  /**
   * 'confirm' — post-payment modal that collects measurements for all products at once.
   * 'view'    — single-product modal for viewing and editing saved measurements.
   */
  mode: 'confirm' | 'view';

  bookingId: number;
  booking: any;

  // 'confirm' mode: all non-cancelled products
  products?: any[];

  // 'view' mode: single selected product
  selectedProduct?: any;

  // Shared state (lives in parent across modal open/close cycles — loaded from server)
  measurements: { [key: string]: any };
  specialRequirements: { [key: string]: string };
  onMeasurementsChange: (updated: { [key: string]: any }) => void;
  onSpecialRequirementsChange: (updated: { [key: string]: string }) => void;

  // 'view' mode: locking flags
  isOrderCompleted?: boolean;
  isProductRefunded?: (productId: number) => boolean;
  isDropDatePassed?: (product: any) => boolean;
  /**
   * 'view' mode only: open directly in edit mode (used when no measurements exist yet).
   * Defaults to false (view mode).
   */
  defaultEditMode?: boolean;

  onClose: () => void;
  onSaved: () => void; // Parent calls fetchBooking() here
}

// ─── MeasurementModal ─────────────────────────────────────────────────────────

export function MeasurementModal({
  mode,
  bookingId,
  booking,
  products = [],
  selectedProduct,
  measurements,
  specialRequirements,
  onMeasurementsChange,
  onSpecialRequirementsChange,
  isOrderCompleted = false,
  isProductRefunded,
  isDropDatePassed,
  defaultEditMode = false,
  onClose,
  onSaved,
}: MeasurementModalProps) {
  // ── Internal state (confirm mode) ──────────────────────────────────────────
  const [measurementErrors, setMeasurementErrors] = useState<{ [key: string]: string }>({});

  // ── Internal state (view mode) ─────────────────────────────────────────────
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(defaultEditMode);
  const [editingMeasurements, setEditingMeasurements] = useState<{ [key: string]: string }>({});
  const [editingSpecialRequirements, setEditingSpecialRequirements] = useState<string>('');

  // ── Helpers ────────────────────────────────────────────────────────────────

  function uniqueKey(product: any): string {
    const from = product.booked_from || booking?.booked_from;
    const to = product.booked_to || booking?.booked_to;
    return `${product.id}_${from}_${to}`;
  }

  // Confirm mode: validates a single input field (max 2 digits)
  function handleMeasurementChange(key: string, field: string, value: string) {
    const numericValue = value.replace(/\D/g, '');
    if (numericValue.length > 2) {
      setMeasurementErrors(prev => ({
        ...prev,
        [`${key}-${field}`]: 'Please enter correct measurement (maximum 2 digits)',
      }));
      return;
    }
    setMeasurementErrors(prev => ({ ...prev, [`${key}-${field}`]: '' }));
    onMeasurementsChange({
      ...measurements,
      [key]: { ...(measurements[key] || {}), [field]: numericValue },
    });
  }

  // View mode: validates a single input field and syncs to shared state immediately
  function handleEditMeasurementChange(field: string, value: string) {
    const numericValue = value.replace(/\D/g, '');
    if (numericValue.length > 2) return;
    const updated = { ...editingMeasurements, [field]: numericValue };
    setEditingMeasurements(updated);
    if (selectedProduct) {
      onMeasurementsChange({ ...measurements, [uniqueKey(selectedProduct)]: updated });
    }
  }

  // ── Confirm mode: save all products ───────────────────────────────────────

  async function handleConfirmSave() {
    try {
      const allMeasurements = { ...measurements };
      const specialReqsData: { [key: string]: string } = {};
      products.forEach((product: any) => {
        const key = uniqueKey(product);
        specialReqsData[key] = specialRequirements[key] || '';
      });

      await bookingsApi.update(bookingId, {
        measurements: allMeasurements,
        special_requirements: JSON.stringify(specialReqsData),
      } as any);

      onClose();
      onSaved();
      toast.success('Measurements saved successfully!');
    } catch (error) {
      console.error('Error saving measurements:', error);
      toast.error('Error saving measurements');
    }
  }

  // ── View mode: save single product ────────────────────────────────────────

  async function handleViewSave() {
    if (!selectedProduct) return;
    try {
      const key = uniqueKey(selectedProduct);
      const updatedMeasurements = { ...measurements, [key]: editingMeasurements };
      const updatedSpecialReqs = { ...specialRequirements, [key]: editingSpecialRequirements };

      await bookingsApi.update(bookingId, {
        measurements: updatedMeasurements,
        special_requirements: JSON.stringify(updatedSpecialReqs),
      } as any);

      onMeasurementsChange(updatedMeasurements);
      onSpecialRequirementsChange(updatedSpecialReqs);
      setIsEditingMeasurements(false);
      onSaved();
      toast.success('Measurements saved successfully!');
    } catch (error: any) {
      console.error('Error saving measurements:', error);
      const msg = error.response?.data?.details || error.response?.data?.error || error.message || 'Unknown error';
      if (error.response?.status === 404) {
        toast.error('Booking not found. Please refresh the page.');
      } else {
        toast.error(`Error saving measurements: ${msg}`);
      }
    }
  }

  // ── Field renderers ────────────────────────────────────────────────────────

  function renderField(key: string, field: string, placeholder: string, value: string, onChange: (v: string) => void, disabled = false) {
    const errKey = `${key}-${field}`;
    return (
      <div>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          maxLength={2}
          disabled={disabled}
          className={`px-3 py-2 border rounded w-full ${measurementErrors[errKey] ? 'border-red-500' : 'border-gray-300'}`}
        />
        {measurementErrors[errKey] && (
          <p className="text-xs text-red-600 mt-1">{measurementErrors[errKey]}</p>
        )}
      </div>
    );
  }

  function renderMeasurementInputs(
    productName: string,
    key: string,
    getValue: (field: string) => string,
    onChange: (field: string, value: string) => void,
    disabled = false,
  ) {
    if (isFemaleClothing(productName)) {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {renderField(key, 'waist', 'Waist (in inches)', getValue('waist'), v => onChange('waist', v), disabled)}
            {renderField(key, 'bust', 'Bust (in inches)', getValue('bust'), v => onChange('bust', v), disabled)}
            {renderField(key, 'shoulder', 'Shoulder (in inches)', getValue('shoulder'), v => onChange('shoulder', v), disabled)}
            {renderField(key, 'sleevesUp', 'Sleeves Up (in inches)', getValue('sleevesUp'), v => onChange('sleevesUp', v), disabled)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {renderField(key, 'sleevesE', 'Sleeves E (in inches)', getValue('sleevesE'), v => onChange('sleevesE', v), disabled)}
            {renderField(key, 'sleevesB', 'Sleeves B (in inches)', getValue('sleevesB'), v => onChange('sleevesB', v), disabled)}
            {renderField(key, 'lehengaLength', 'Lehenga Length (in inches)', getValue('lehengaLength'), v => onChange('lehengaLength', v), disabled)}
          </div>
        </div>
      );
    }

    if (isMaleClothing(productName)) {
      return (
        <div className="space-y-3">
          <h4 className="text-md font-medium text-gray-700 mb-1">Tight Fit</h4>
          <div className="grid grid-cols-4 gap-3">
            {renderField(key, 'sideTight', 'Side Tight (in inches)', getValue('sideTight'), v => onChange('sideTight', v), disabled)}
            {renderField(key, 'sleevesTight', 'Sleeves Tight (in inches)', getValue('sleevesTight'), v => onChange('sleevesTight', v), disabled)}
            {renderField(key, 'sleevesLength', 'Sleeves Length (in inches)', getValue('sleevesLength'), v => onChange('sleevesLength', v), disabled)}
            {renderField(key, 'pantLength', 'Pant Length (in inches)', getValue('pantLength'), v => onChange('pantLength', v), disabled)}
          </div>
          <h4 className="text-md font-medium text-gray-700 mt-3 mb-1">Loose Fit</h4>
          <div className="grid grid-cols-4 gap-3">
            {renderField(key, 'sideLoose', 'Side Loose (in inches)', getValue('sideLoose'), v => onChange('sideLoose', v), disabled)}
            {renderField(key, 'sleevesLoose', 'Sleeves Loose (in inches)', getValue('sleevesLoose'), v => onChange('sleevesLoose', v), disabled)}
            {renderField(key, 'sleevesLengthLoose', 'Sleeves Length (in inches)', getValue('sleevesLengthLoose'), v => onChange('sleevesLengthLoose', v), disabled)}
            {renderField(key, 'pantLengthLoose', 'Pant Length (in inches)', getValue('pantLengthLoose'), v => onChange('pantLengthLoose', v), disabled)}
          </div>
        </div>
      );
    }

    // Default
    return (
      <div className="grid grid-cols-4 gap-3">
        {renderField(key, 'waist', 'Waist (in inches)', getValue('waist'), v => onChange('waist', v), disabled)}
        {renderField(key, 'bust', 'Bust (in inches)', getValue('bust'), v => onChange('bust', v), disabled)}
        {renderField(key, 'chest', 'Chest (in inches)', getValue('chest'), v => onChange('chest', v), disabled)}
        {renderField(key, 'shoulder', 'Shoulder (in inches)', getValue('shoulder'), v => onChange('shoulder', v), disabled)}
      </div>
    );
  }

  // ── View mode: read-only display ──────────────────────────────────────────

  function renderMeasurementDisplay(productName: string, meas: any) {
    const item = (label: string, value: string | undefined) =>
      value ? (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}"</p>
        </div>
      ) : null;

    if (isFemaleClothing(productName)) {
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Female Measurements (in inches)</h3>
          <div className="grid grid-cols-2 gap-4">
            {item('Waist', meas.waist)}
            {item('Bust', meas.bust)}
            {item('Shoulder', meas.shoulder)}
            {item('Sleeves Up', meas.sleevesUp)}
            {item('Sleeves E', meas.sleevesE)}
            {item('Sleeves B', meas.sleevesB)}
            {item('Lehenga Length', meas.lehengaLength)}
          </div>
        </div>
      );
    }

    if (isMaleClothing(productName)) {
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Male Measurements (in inches)</h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-md font-medium text-gray-700 mb-3">Tight Fit</h4>
              <div className="grid grid-cols-2 gap-4">
                {item('Side Tight', meas.sideTight)}
                {item('Sleeves Tight', meas.sleevesTight)}
                {item('Sleeves Length', meas.sleevesLength)}
                {item('Pant Length', meas.pantLength)}
              </div>
            </div>
            <div>
              <h4 className="text-md font-medium text-gray-700 mb-3">Loose Fit</h4>
              <div className="grid grid-cols-2 gap-4">
                {item('Side Loose', meas.sideLoose)}
                {item('Sleeves Loose', meas.sleevesLoose)}
                {item('Sleeves Length', meas.sleevesLengthLoose)}
                {item('Pant Length', meas.pantLengthLoose)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Measurements (in inches)</h3>
        <div className="grid grid-cols-2 gap-4">
          {item('Waist', meas.waist)}
          {item('Bust', meas.bust)}
          {item('Chest', meas.chest)}
          {item('Shoulder', meas.shoulder)}
        </div>
      </div>
    );
  }

  // ── Render: confirm mode ───────────────────────────────────────────────────

  if (mode === 'confirm') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
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

          {products.map((product: any, index: number) => {
            const key = uniqueKey(product);
            const imageData = product.image || product.imageUrl || product.rawImage;
            const imageUrl = imageData ? getImageUrl(imageData) : null;
            const bookedFrom = product.booked_from || booking?.booked_from;
            const bookedTo = product.booked_to || booking?.booked_to;

            return (
              <div key={index} className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex gap-4 mb-4">
                  <div className="w-16 h-20 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                    {imageUrl ? (
                      <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-2xl">👔</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mb-1">
                      <h4 className="font-semibold text-gray-900">{product.name}</h4>
                      {product.code && (
                        <p className="text-xs text-gray-500 font-mono mt-0.5">Code: {product.code}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      ₹{Math.floor(product.effective_rent || product.rent || 0)} / Day
                      {product.effective_rent && product.effective_rent < product.rent && (
                        <span className="text-xs text-gray-400 line-through ml-1">₹{Math.floor(product.rent)}</span>
                      )}
                    </p>
                    <p className="text-sm text-red-600 mt-1">
                      Dates: {new Date(bookedFrom).toLocaleDateString('en-GB')} To {new Date(bookedTo).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>

                {renderMeasurementInputs(
                  product.name,
                  key,
                  field => measurements[key]?.[field] || '',
                  (field, value) => handleMeasurementChange(key, field, value),
                )}

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Requirements (if any):
                  </label>
                  <textarea
                    placeholder="Enter any additional fitting requirements"
                    value={specialRequirements[key] || ''}
                    onChange={e => {
                      onSpecialRequirementsChange({ ...specialRequirements, [key]: e.target.value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={2}
                  />
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              CANCEL
            </button>
            <button
              onClick={handleConfirmSave}
              className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
            >
              SAVE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: view mode ─────────────────────────────────────────────────────

  if (!selectedProduct) return null;

  const key = uniqueKey(selectedProduct);
  const productMeasurements = measurements[key] || measurements[selectedProduct.id] || {};
  const hasMeasurements = Object.keys(productMeasurements).length > 0;
  const isFemale = isFemaleClothing(selectedProduct.name);
  const isMale = isMaleClothing(selectedProduct.name);
  const currentSpecialReqs = isEditingMeasurements
    ? editingSpecialRequirements
    : (specialRequirements[key] || '');

  // refundLocked: disables inputs and shows locked Edit button — but does NOT show warning banner
  const refundLocked = isProductRefunded ? isProductRefunded(selectedProduct.id) : false;
  // dateLocked: triggers locked warning banner (drop date passed)
  const dateLocked = isDropDatePassed ? isDropDatePassed(selectedProduct) : false;

  function startEditing() {
    setIsEditingMeasurements(true);
    setEditingMeasurements(productMeasurements);
    setEditingSpecialRequirements(specialRequirements[key] || '');
  }

  function cancelEditing() {
    setIsEditingMeasurements(false);
    setEditingMeasurements(productMeasurements);
    setEditingSpecialRequirements(specialRequirements[key] || '');
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Measurements</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Product Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="flex gap-4">
            <div className="w-20 h-28 bg-gray-200 rounded overflow-hidden flex-shrink-0">
              {getImageUrl(selectedProduct.image) ? (
                <img
                  src={getImageUrl(selectedProduct.image)!}
                  alt={selectedProduct.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl">👔</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{selectedProduct.name}</h3>
              {selectedProduct.code && (
                <p className="text-xs text-gray-500 font-mono mb-1">Code: {selectedProduct.code}</p>
              )}
              <p className="text-sm text-gray-600">₹{Math.floor(selectedProduct.rent || 0)} / Day</p>
            </div>
          </div>
        </div>

        {/* Measurements Display/Edit */}
        {(() => {
          // No measurements + not editing
          if (!hasMeasurements && !isEditingMeasurements) {
            return (
              <div className="text-center py-8">
                <p className="text-gray-500 text-lg mb-4">No measurements recorded yet</p>
                {isOrderCompleted ? (
                  <div className="px-6 py-2 bg-gray-300 text-gray-600 rounded-lg font-medium cursor-not-allowed inline-block">
                    Measurements Locked (Order Completed)
                  </div>
                ) : (
                  <button
                    onClick={startEditing}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                  >
                    ➕ Add Measurements
                  </button>
                )}
              </div>
            );
          }

          // Locked banner: only for order completed or drop date passed (NOT refund)
          if (isOrderCompleted || dateLocked) {
            return (
              <div className="space-y-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-yellow-800 font-medium">
                      {isOrderCompleted
                        ? 'Measurements cannot be changed after order completion.'
                        : 'Measurements cannot be changed after the product drop date has passed.'}
                    </p>
                  </div>
                </div>
                {renderMeasurementDisplay(selectedProduct.name, productMeasurements)}
                {currentSpecialReqs && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Special Requirements</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-700 whitespace-pre-wrap">{currentSpecialReqs}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // View mode (has measurements, not editing)
          if (!isEditingMeasurements && hasMeasurements) {
            return (
              <div className="space-y-6">
                {renderMeasurementDisplay(selectedProduct.name, productMeasurements)}
                {currentSpecialReqs && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Special Requirements</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-700 whitespace-pre-wrap">{currentSpecialReqs}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // Edit mode
          return (
            <div className="space-y-6">
              {renderMeasurementInputs(
                selectedProduct.name,
                key,
                field => editingMeasurements[field] || '',
                (field, value) => handleEditMeasurementChange(field, value),
                refundLocked || dateLocked,
              )}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Requirements (if any):
                </label>
                <textarea
                  placeholder="Enter any additional fitting requirements"
                  value={editingSpecialRequirements}
                  onChange={e => {
                    const newValue = e.target.value;
                    setEditingSpecialRequirements(newValue);
                    onSpecialRequirementsChange({ ...specialRequirements, [key]: newValue });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                  disabled={refundLocked || dateLocked}
                />
              </div>
            </div>
          );
        })()}

        {/* Footer buttons */}
        <div className="mt-6 flex gap-3 justify-end">
          {isEditingMeasurements ? (
            <>
              <button
                onClick={cancelEditing}
                className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleViewSave}
                className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Close
              </button>
              {hasMeasurements && (
                (refundLocked || dateLocked) ? (
                  <div className="px-6 py-2 bg-gray-300 text-gray-600 rounded-lg font-medium cursor-not-allowed">
                    {refundLocked
                      ? 'Edit (Locked - Refund Completed)'
                      : 'Edit (Locked - Drop Date Passed)'}
                  </div>
                ) : (
                  <button
                    onClick={startEditing}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                  >
                    Edit
                  </button>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
