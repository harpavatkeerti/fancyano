'use client';

import { useState } from 'react';
import { bookingsApi } from '@/lib/api';
import type { MeasurementTemplateField } from '@/lib/api';
import { getImageUrl } from '@/lib/imageHelper';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from './AlertBanner';

/**
 * Resolve the measurement template fields for a product.
 * The backend now returns `measurement_template_fields` on each booking product,
 * which is the JSONB array of { key, label, group? } from the measurement_templates table.
 */
export function getTemplateFields(product: any): MeasurementTemplateField[] | null {
  const fields = product?.measurement_template_fields;
  if (!fields) return null;
  if (typeof fields === 'string') {
    try { return JSON.parse(fields); } catch { return null; }
  }
  if (Array.isArray(fields)) return fields;
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeasurementModalProps {
  /**
   * 'confirm' — post-payment modal that collects measurements for all products at once.
   * 'edit'    — single-product modal for editing saved measurements.
   */
  mode: 'confirm' | 'edit';

  bookingId: number;
  booking: any;

  // 'confirm' mode: all non-cancelled products
  products?: any[];

  // 'edit' mode: single selected product
  selectedProduct?: any;

  // Shared state (lives in parent across modal open/close cycles — loaded from server)
  measurements: { [key: string]: any };
  specialRequirements: { [key: string]: string };
  onMeasurementsChange: (updated: { [key: string]: any }) => void;
  onSpecialRequirementsChange: (updated: { [key: string]: string }) => void;

  // 'edit' mode: locking flags
  isProductRefunded?: (productId: number) => boolean;

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
  isProductRefunded,
  onClose,
  onSaved,
}: MeasurementModalProps) {
  // ── Internal state (confirm mode) ──────────────────────────────────────────
  const [measurementErrors, setMeasurementErrors] = useState<{ [key: string]: string }>({});
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();

  // ── Internal state (edit mode) ─────────────────────────────────────────────
  const [editingMeasurements, setEditingMeasurements] = useState<{ [key: string]: string }>(
    () => {
      if (mode === 'edit' && selectedProduct) {
        const from = selectedProduct.booked_from || booking?.booked_from;
        const to = selectedProduct.booked_to || booking?.booked_to;
        const key = `${selectedProduct.id}_${from}_${to}`;
        return { ...(measurements[key] || measurements[selectedProduct.id] || {}) };
      }
      return {};
    },
  );
  const [editingSpecialRequirements, setEditingSpecialRequirements] = useState<string>(() => {
    if (mode === 'edit' && selectedProduct) {
      const from = selectedProduct.booked_from || booking?.booked_from;
      const to = selectedProduct.booked_to || booking?.booked_to;
      const key = `${selectedProduct.id}_${from}_${to}`;
      return specialRequirements[key] || '';
    }
    return '';
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function uniqueKey(product: any): string {
    const from = product.booked_from || booking?.booked_from;
    const to = product.booked_to || booking?.booked_to;
    return `${product.id}_${from}_${to}`;
  }

  // Confirm mode: accepts any text input for measurement fields
  function handleMeasurementChange(key: string, field: string, value: string) {
    setMeasurementErrors(prev => ({ ...prev, [`${key}-${field}`]: '' }));
    onMeasurementsChange({
      ...measurements,
      [key]: { ...(measurements[key] || {}), [field]: value },
    });
  }

  // Edit mode: accepts any text input and updates local draft only (not parent)
  function handleEditMeasurementChange(field: string, value: string) {
    setEditingMeasurements(prev => ({ ...prev, [field]: value }));
  }

  // ── Confirm mode: save all products ───────────────────────────────────────

  async function handleConfirmSave() {
    try {
      clearAlerts();
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
      addAlert('Error saving measurements');
    }
  }

  // ── Edit mode: save single product ────────────────────────────────────────

  async function handleEditSave() {
    if (!selectedProduct) return;
    try {
      clearAlerts();
      const key = uniqueKey(selectedProduct);
      const updatedMeasurements = { ...measurements, [key]: editingMeasurements };
      const updatedSpecialReqs = { ...specialRequirements, [key]: editingSpecialRequirements };

      await bookingsApi.update(bookingId, {
        measurements: updatedMeasurements,
        special_requirements: JSON.stringify(updatedSpecialReqs),
      } as any);

      onMeasurementsChange(updatedMeasurements);
      onSpecialRequirementsChange(updatedSpecialReqs);
      onSaved();
      onClose();
      toast.success('Measurements saved successfully!');
    } catch (error: any) {
      console.error('Error saving measurements:', error);
      const msg = error.response?.data?.details || error.response?.data?.error || error.message || 'Unknown error';
      if (error.response?.status === 404) {
        addAlert('Booking not found. Please refresh the page.');
      } else {
        addAlert(`Error saving measurements: ${msg}`);
      }
    }
  }

  // ── Field renderers ────────────────────────────────────────────────────────

  function renderField(key: string, field: string, placeholder: string, value: string, onChange: (v: string) => void, disabled = false) {
    const errKey = `${key}-${field}`;
    return (
      <div key={field}>
        <label className="block text-xs font-medium text-gray-600 mb-1">{placeholder}</label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className={`px-3 py-2 border rounded w-full ${measurementErrors[errKey] ? 'border-red-500' : 'border-gray-300'}`}
        />
        {measurementErrors[errKey] && (
          <p className="text-xs text-red-600 mt-1">{measurementErrors[errKey]}</p>
        )}
      </div>
    );
  }

  /**
   * Template-driven measurement field renderer.
   * Groups fields by the optional `group` property and renders each group
   * with a heading + grid of input fields.
   * Returns null if the product has no measurement template (special_requirements only).
   */
  function renderTemplateFields(
    product: any,
    key: string,
    getValue: (field: string) => string,
    onChange: (field: string, value: string) => void,
    disabled = false,
  ) {
    const templateFields = getTemplateFields(product);
    if (!templateFields || templateFields.length === 0) return null;

    // Group fields by their optional group name (empty string = ungrouped)
    const groupOrder: string[] = [];
    const groups: Record<string, MeasurementTemplateField[]> = {};
    for (const field of templateFields) {
      const groupName = field.group || '';
      if (!groups[groupName]) {
        groups[groupName] = [];
        groupOrder.push(groupName);
      }
      groups[groupName].push(field);
    }

    // Strip "(in inches)" from individual labels — it goes on the group heading instead
    const cleanLabel = (label: string) => label.replace(/\s*\(in inches\)\s*/gi, '').trim();

    return (
      <div className="space-y-3">
        {groupOrder.map((groupName) => (
          <div key={groupName || '__ungrouped'}>
            {groupName ? (
              <h4 className="text-md font-medium text-gray-700 mb-1 mt-3">
                {groupName} <span className="text-xs font-normal text-gray-400">(in inches)</span>
              </h4>
            ) : (
              <h4 className="text-xs font-normal text-gray-400 mb-1 mt-3">All measurements in inches</h4>
            )}
            <div className="grid grid-cols-2 gap-3">
              {groups[groupName].map((f) =>
                renderField(key, f.key, cleanLabel(f.label), getValue(f.key), v => onChange(f.key, v), disabled)
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Render: confirm mode ───────────────────────────────────────────────────

  if (mode === 'confirm') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
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

          {/* Inline alert banner for errors */}
          <AlertBanner alerts={alerts} onDismiss={removeAlert} className="mb-4" />

          {products.map((product: any, index: number) => {
            const key = uniqueKey(product);
            const imageData = product.image || product.imageUrl || product.rawImage;
            const imageUrl = imageData ? getImageUrl(imageData) : null;
            const bookedFrom = product.booked_from || booking?.booked_from;
            const bookedTo = product.booked_to || booking?.booked_to;
            const hasTemplate = !!getTemplateFields(product);

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
                        <p className="text-xs text-gray-500 font-mono mt-0.5">Code: {product.code}{product.size ? ` · Size: ${product.size}` : ''}</p>
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

                {renderTemplateFields(
                  product,
                  key,
                  field => measurements[key]?.[field] || '',
                  (field, value) => handleMeasurementChange(key, field, value),
                )}

                <div className={hasTemplate ? 'mt-4' : ''}>
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
      </div>
    );
  }

  // ── Render: edit mode ─────────────────────────────────────────────────────

  if (!selectedProduct) return null;

  const key = uniqueKey(selectedProduct);

  const refundLocked = isProductRefunded ? isProductRefunded(selectedProduct.id) : false;
  const inputsDisabled = refundLocked;
  const hasTemplate = !!getTemplateFields(selectedProduct);

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
                <p className="text-xs text-gray-500 font-mono mb-1">Code: {selectedProduct.code}{selectedProduct.size ? ` · Size: ${selectedProduct.size}` : ''}</p>
              )}
              <p className="text-sm text-gray-600">₹{Math.floor(selectedProduct.rent || 0)} / Day</p>
            </div>
          </div>
        </div>

        {inputsDisabled && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-yellow-800 font-medium">
                Measurements cannot be changed after a refund has been completed.
              </p>
            </div>
          </div>
        )}

        {/* Measurement inputs */}
        <div className="space-y-6">
          {renderTemplateFields(
            selectedProduct,
            key,
            field => editingMeasurements[field] || '',
            (field, value) => handleEditMeasurementChange(field, value),
            inputsDisabled,
          )}
          <div className={hasTemplate ? 'mt-4' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Special Requirements (if any):
            </label>
            <textarea
              placeholder="Enter any additional fitting requirements"
              value={editingSpecialRequirements}
              onChange={e => setEditingSpecialRequirements(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              disabled={inputsDisabled}
            />
          </div>
        </div>

        {/* Footer buttons */}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          {!inputsDisabled && (
            <button
              onClick={handleEditSave}
              className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
