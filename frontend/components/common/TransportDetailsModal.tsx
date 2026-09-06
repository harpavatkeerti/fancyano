'use client';

import { useState, useRef, useEffect } from 'react';
import { transportersApi, Transporter } from '@/lib/api';
import { isValidPhoneNumber } from '@/lib/countryCodes';

export interface TransportFormData {
  transporter_id?: number;
  transporter_name: string;
  phone: string;
  bus_no: string;
  destination: string;
  source_address: string;
  destination_address: string;
  destination_phone: string;
}

const EMPTY_FORM: TransportFormData = {
  transporter_name: '', phone: '', bus_no: '', destination: '',
  source_address: '', destination_address: '', destination_phone: '',
};

const BUS_REGEX = /^[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}$/;

export interface TransportProduct {
  id: string | number;
  name: string;
  code?: string;
  size?: string;
}

interface TransportDetailsModalProps {
  products: TransportProduct[];
  initialValues: Record<string | number, Partial<TransportFormData>>;
  onSave: (data: Record<string | number, TransportFormData>) => Promise<void>;
  onClose: () => void;
  onApplyToAll?: (data: TransportFormData) => Promise<void>;
  title?: string;
}

export function TransportDetailsModal({
  products, initialValues, onSave, onClose, onApplyToAll, title,
}: TransportDetailsModalProps) {
  // Per-product form state
  const [forms, setForms] = useState<Record<string | number, TransportFormData>>(() => {
    const init: Record<string | number, TransportFormData> = {};
    products.forEach(p => {
      init[p.id] = { ...EMPTY_FORM, ...initialValues[p.id] };
    });
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New-transporter confirm dialog
  const [showNewTransporterConfirm, setShowNewTransporterConfirm] = useState(false);
  const [newTransporterNames, setNewTransporterNames] = useState<string[]>([]);

  function updateField(productId: string | number, field: keyof TransportFormData, value: string) {
    setForms(prev => {
      const updated = { ...prev[productId], [field]: value };
      if (field === 'transporter_name' || field === 'phone') {
        delete updated.transporter_id;
      }
      return { ...prev, [productId]: updated as TransportFormData };
    });
  }

  function selectTransporter(productId: string | number, t: Transporter) {
    setForms(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        transporter_id: t.id,
        transporter_name: t.name,
        phone: t.phone,
        bus_no: t.bus_no || prev[productId]?.bus_no || '',
      },
    }));
  }

  function handleApplyToAll(sourceId: string | number) {
    const source = forms[sourceId];
    if (!source) return;

    if (products.length > 1) {
      setForms(prev => {
        const updated = { ...prev };
        products.forEach(p => { updated[p.id] = { ...source }; });
        return updated;
      });
    }

    if (onApplyToAll) {
      onApplyToAll(source);
    }
  }

  function validate(): boolean {
    for (const p of products) {
      const f = forms[p.id] || EMPTY_FORM;
      if (f.phone && !isValidPhoneNumber(f.phone, 'IN')) {
        setError(`${p.name}: Driver mobile must be exactly 10 digits`);
        return false;
      }
      if (f.destination_phone && !isValidPhoneNumber(f.destination_phone, 'IN')) {
        setError(`${p.name}: Destination mobile must be exactly 10 digits`);
        return false;
      }
      if (f.bus_no && !BUS_REGEX.test(f.bus_no.replace(/[\s\-]/g, '').toUpperCase())) {
        setError(`${p.name}: Bus/Vehicle No format invalid (e.g. GJ05AB1234)`);
        return false;
      }
    }
    return true;
  }

  // Collect unique new transporter names (have name+phone but no transporter_id)
  function getNewTransporterEntries(): { productId: string | number; form: TransportFormData }[] {
    const seen = new Set<string>();
    const entries: { productId: string | number; form: TransportFormData }[] = [];
    for (const p of products) {
      const f = forms[p.id];
      if (f && f.transporter_name && f.phone && !f.transporter_id) {
        const key = `${f.transporter_name.trim().toLowerCase()}|${f.phone.trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ productId: p.id, form: f });
        }
      }
    }
    return entries;
  }

  async function handleSubmit() {
    setError('');
    if (!validate()) return;

    // Check for new transporters
    const newEntries = getNewTransporterEntries();
    if (newEntries.length > 0) {
      setNewTransporterNames(newEntries.map(e => `${e.form.transporter_name} (${e.form.phone})`));
      setShowNewTransporterConfirm(true);
      return;
    }

    await doSave();
  }

  async function handleConfirmNewTransporters(shouldCreate: boolean) {
    setShowNewTransporterConfirm(false);
    setSaving(true);
    setError('');

    let finalForms = { ...forms };

    if (shouldCreate) {
      try {
        const newEntries = getNewTransporterEntries();
        for (const entry of newEntries) {
          const res = await transportersApi.create({
            name: entry.form.transporter_name.trim(),
            phone: entry.form.phone.trim(),
            phone_country: 'IN',
            bus_no: entry.form.bus_no || undefined,
          } as any);
          const newId = res.data.id;
          // Link all products with the same name+phone to this new transporter
          for (const p of products) {
            const f = finalForms[p.id];
            if (f && f.transporter_name.trim().toLowerCase() === entry.form.transporter_name.trim().toLowerCase()
              && f.phone.trim() === entry.form.phone.trim() && !f.transporter_id) {
              finalForms[p.id] = { ...f, transporter_id: newId };
            }
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to create transporter');
        setSaving(false);
        return;
      }
    }

    try {
      setForms(finalForms);
      await onSave(finalForms);
    } catch (err: any) {
      setError(err?.message || 'Failed to save transport details');
    } finally {
      setSaving(false);
    }
  }

  async function doSave() {
    setSaving(true);
    try {
      await onSave(forms);
    } catch (err: any) {
      setError(err?.message || 'Failed to save transport details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{title || '📍 Transport Details'}</h2>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Per-product forms — scrollable list like MeasurementModal */}
          {products.map((product) => (
            <ProductTransportForm
              key={product.id}
              product={product}
              form={forms[product.id] || EMPTY_FORM}
              onUpdateField={(field, value) => updateField(product.id, field, value)}
              onSelectTransporter={(t) => selectTransporter(product.id, t)}
              showApplyToAll={products.length > 1 || !!onApplyToAll}
              onApplyToAll={() => handleApplyToAll(product.id)}
            />
          ))}

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* New transporter confirm dialog */}
      {showNewTransporterConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold mb-3">Save New Transporter?</h3>
            <p className="text-sm text-gray-600 mb-3">
              The following transporter(s) are not yet saved. Would you like to save them for future use?
            </p>
            <ul className="mb-4 space-y-1">
              {newTransporterNames.map((name, i) => (
                <li key={i} className="text-sm font-medium text-teal-700 bg-teal-50 rounded px-3 py-1.5">🚚 {name}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowNewTransporterConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                Cancel
              </button>
              <button onClick={() => handleConfirmNewTransporters(true)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Per-product form card ──────────────────────────────────────────────── */

function ProductTransportForm({
  product, form, onUpdateField, onSelectTransporter, showApplyToAll, onApplyToAll,
}: {
  product: TransportProduct;
  form: TransportFormData;
  onUpdateField: (field: keyof TransportFormData, value: string) => void;
  onSelectTransporter: (t: Transporter) => void;
  showApplyToAll: boolean;
  onApplyToAll: () => void;
}) {
  // Transporter autocomplete
  const [searchQuery, setSearchQuery] = useState(form.transporter_name || '');

  // Sync when parent form changes (e.g. "Apply same to all")
  useEffect(() => {
    setSearchQuery(form.transporter_name || '');
  }, [form.transporter_name]);
  const [searchResults, setSearchResults] = useState<Transporter[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Inline validation
  const phoneVal = form.phone || '';
  const destPhoneVal = form.destination_phone || '';
  const busVal = form.bus_no || '';
  const phoneInvalid = phoneVal.length > 0 && !isValidPhoneNumber(phoneVal, 'IN');
  const destPhoneInvalid = destPhoneVal.length > 0 && !isValidPhoneNumber(destPhoneVal, 'IN');
  const busInvalid = busVal.length > 0 && !BUS_REGEX.test(busVal.replace(/[\s\-]/g, '').toUpperCase());

  async function handleSearch(query: string) {
    setSearchQuery(query);
    onUpdateField('transporter_name', query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await transportersApi.search(query.trim());
        setSearchResults(res.data || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 350);
  }

  function handleSelect(t: Transporter) {
    onSelectTransporter(t);
    setSearchQuery(t.name);
    setShowDropdown(false);
    setSearchResults([]);
  }

  const inputBase = "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2";
  const inputOk = `${inputBase} border-gray-300 focus:ring-teal-500`;
  const inputErr = `${inputBase} border-red-400 bg-red-50 focus:ring-red-500`;

  return (
    <div className="bg-gray-50 rounded-lg p-4 mb-4">
      {/* Product header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-semibold text-gray-900">{product.name}</h4>
          {product.code && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {product.code}{product.size ? ` · ${product.size}` : ''}
            </p>
          )}
        </div>
        {showApplyToAll && (
          <button onClick={onApplyToAll}
            className="text-xs bg-teal-100 text-teal-700 px-3 py-1 rounded hover:bg-teal-200 transition-colors font-medium">
            Apply Same to All
          </button>
        )}
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-3">
        {/* Transporter Name with autocomplete */}
        <div className="relative" ref={dropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
          <input type="text" value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search or type name"
            className={inputOk} />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
              {searchResults.map((t) => (
                <button key={t.id} onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm border-b border-gray-100">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-gray-400 ml-2">{t.phone}</span>
                  {t.bus_no && <span className="text-gray-400 ml-2">• {t.bus_no}</span>}
                </button>
              ))}
            </div>
          )}
          {form.transporter_id && <p className="text-xs text-teal-600 mt-1">✅ Linked to saved transporter</p>}
        </div>

        {/* Driver Mobile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Driver Mobile</label>
          <input type="text" value={phoneVal}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); onUpdateField('phone', v); }}
            placeholder="9876543210" maxLength={10}
            className={phoneInvalid ? inputErr : inputOk} />
          {phoneInvalid && <p className="text-xs text-red-500 mt-1">Must be 10 digits</p>}
        </div>

        {/* Bus No */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bus / Vehicle No</label>
          <input type="text" value={busVal}
            onChange={(e) => onUpdateField('bus_no', e.target.value.toUpperCase())}
            placeholder="GJ05AB1234"
            className={busInvalid ? inputErr : inputOk} />
          {busInvalid && <p className="text-xs text-red-500 mt-1">Format: RJ27CD6709</p>}
        </div>

        {/* Destination */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">📍 Destination</label>
          <input type="text" value={form.destination}
            onChange={(e) => onUpdateField('destination', e.target.value)}
            placeholder="Rajkot, Gujarat"
            className={inputOk} />
        </div>

        {/* Source Office */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">🏢 Source Office Address</label>
          <input type="text" value={form.source_address}
            onChange={(e) => onUpdateField('source_address', e.target.value)}
            placeholder="Near Railway Station, Kalupur, Ahmedabad"
            className={inputOk} />
        </div>

        {/* Destination Office */}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">🏢 Destination Office Address</label>
          <input type="text" value={form.destination_address}
            onChange={(e) => onUpdateField('destination_address', e.target.value)}
            placeholder="Near Bus Stand, Rajkot"
            className={inputOk} />
        </div>

        {/* Destination Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">📞 Destination Office Mobile</label>
          <input type="text" value={destPhoneVal}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); onUpdateField('destination_phone', v); }}
            placeholder="9123456780" maxLength={10}
            className={destPhoneInvalid ? inputErr : inputOk} />
          {destPhoneInvalid && <p className="text-xs text-red-500 mt-1">Must be 10 digits</p>}
        </div>
      </div>
    </div>
  );
}
