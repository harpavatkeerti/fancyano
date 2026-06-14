'use client';

import { settingsApi, policiesApi } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';

import { toast } from '@/lib/toast';

// Each policy tier = one row in rental_policies table
interface PolicyTier {
  id?: number;            // rental_policies.id (if exists)
  policy_key: string;     // unique key
  percentage: number;     // penalty percentage
  days_min: number;       // days_from_booking_min
  days_max: number | null; // days_from_booking_max (null = open-ended)
}

interface SalesmanPermissions {
  rental_price_update: boolean;
  cancellation_allowed: boolean;
  exchange_allowed: boolean;
  update_payment_methods: boolean;
  discount_allowed: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPolicyType, setEditingPolicyType] = useState<'exchange' | 'cancellation' | null>(null);

  // Policy tiers from rental_policies table
  const [exchangeTiers, setExchangeTiers] = useState<PolicyTier[]>([]);
  const [cancellationTiers, setCancellationTiers] = useState<PolicyTier[]>([]);

  // Modal state for editing
  const [modalPenalties, setModalPenalties] = useState<number[]>([10, 10, 20, 50]);
  const [modalDays, setModalDays] = useState<number[]>([3, 5, 7, -1]);

  const [salesmanPermissions, setSalesmanPermissions] = useState<SalesmanPermissions>({
    rental_price_update: true,
    cancellation_allowed: false,
    exchange_allowed: false,
    update_payment_methods: false,
    discount_allowed: false,
  });

  const [lateCharges, setLateCharges] = useState<string>('');
  const [exchangeCharges, setExchangeCharges] = useState<string>('');

  // Late fee policy (from rental_policies table)
  const [lateFeePolicy, setLateFeePolicy] = useState<any>(null);
  const [lateFeeValue, setLateFeeValue] = useState<string>('200');

  // Payment QR Codes (dual)
  const [rentQrCode, setRentQrCode] = useState<string>('');
  const [securityQrCode, setSecurityQrCode] = useState<string>('');
  const rentQrFileInputRef = useRef<HTMLInputElement>(null);
  const securityQrFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  /**
   * Convert rental_policies rows into sorted PolicyTier array
   */
  function policiesToTiers(policies: any[]): PolicyTier[] {
    return policies
      .map(p => ({
        id: p.id,
        policy_key: p.policy_key,
        percentage: p.value || 0,
        days_min: p.days_from_booking_min ?? 0,
        days_max: p.days_from_booking_max ?? null,
      }))
      .sort((a, b) => (a.days_min ?? 0) - (b.days_min ?? 0));
  }

  /**
   * Convert tiers into display format: day thresholds and percentages
   * E.g. tiers [{min:0,max:3,10%}, {min:4,max:5,10%}, {min:6,max:7,20%}, {min:8,max:null,50%}]
   * → days: [3, 5, 7, -1], percentages: [10, 10, 20, 50]
   */
  function tiersToDisplay(tiers: PolicyTier[]): { days: number[]; percentages: number[] } {
    if (tiers.length === 0) {
      return { days: [3, 5, 7, -1], percentages: [10, 10, 20, 50] };
    }
    const days: number[] = [];
    const percentages: number[] = [];
    for (const tier of tiers) {
      percentages.push(tier.percentage);
      days.push(tier.days_max !== null ? tier.days_max : -1);
    }
    return { days, percentages };
  }

  async function fetchSettings() {
    try {
      setLoading(true);

      // Fetch exchange penalty policies from rental_policies table
      try {
        const exchangeResponse = await policiesApi.getAll('exchange_penalty');
        if (exchangeResponse.data && exchangeResponse.data.length > 0) {
          setExchangeTiers(policiesToTiers(exchangeResponse.data));
        }
      } catch { }

      // Fetch cancellation penalty policies from rental_policies table
      try {
        const cancelResponse = await policiesApi.getAll('cancellation_penalty');
        if (cancelResponse.data && cancelResponse.data.length > 0) {
          setCancellationTiers(policiesToTiers(cancelResponse.data));
        }
      } catch { }

      // Fetch salesman permissions
      try {
        const permData = await settingsApi.getByKey('salesman_permissions');
        if (permData.data?.setting_value) {
          setSalesmanPermissions(JSON.parse(permData.data.setting_value));
        }
      } catch { }

      // Fetch late charges
      try {
        const lateData = await settingsApi.getByKey('late_charges_per_day');
        if (lateData.data?.setting_value) {
          setLateCharges(lateData.data.setting_value);
        }
      } catch { }

      // Fetch exchange charges
      try {
        const exchangeData = await settingsApi.getByKey('exchange_charges');
        if (exchangeData.data?.setting_value) {
          setExchangeCharges(exchangeData.data.setting_value);
        }
      } catch { }

      // Fetch payment QR codes (rent + security)
      try {
        const rentQr = await settingsApi.getByKey('payment_qr_rent');
        if (rentQr.data?.setting_value) setRentQrCode(rentQr.data.setting_value);
      } catch { }
      try {
        const secQr = await settingsApi.getByKey('payment_qr_security');
        if (secQr.data?.setting_value) setSecurityQrCode(secQr.data.setting_value);
      } catch { }

      // Fetch late fee policy from rental_policies table
      try {
        const policiesResponse = await policiesApi.getAll('late_fee');
        if (policiesResponse.data && policiesResponse.data.length > 0) {
          const policy = policiesResponse.data[0];
          setLateFeePolicy(policy);
          setLateFeeValue(policy.value?.toString() || '200');
        }
      } catch { }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Save modal day thresholds + percentages as rental_policies rows.
   * Uses batch replace: deactivates all old tiers and creates fresh ones.
   */
  async function savePolicyTiers(
    policyType: 'exchange_penalty' | 'cancellation_penalty',
    days: number[],
    percentages: number[]
  ): Promise<PolicyTier[]> {
    const prefix = policyType === 'exchange_penalty' ? 'exchange' : 'cancellation';
    const label = policyType === 'exchange_penalty' ? 'Exchange' : 'Cancellation';

    // Build tier definitions from the modal values
    // days = [3, 5, 7, -1], percentages = [10, 10, 20, 50]
    // → tier 0: 0..3, tier 1: 4..5, tier 2: 6..7, tier 3: 8..null
    const tiers: Array<{
      policy_key: string;
      policy_name: string;
      value_type: string;
      value: number;
      days_from_booking_min: number;
      days_from_booking_max: number | null;
    }> = [];

    let prevMax = -1;
    for (let i = 0; i < days.length; i++) {
      const min = prevMax + 1;
      const max = days[i] === -1 ? null : days[i];
      const tierKey = `${prefix}_penalty_tier_${i}`;
      const tierName = max !== null
        ? `${label} Penalty (${min}-${max} days)`
        : `${label} Penalty (After ${min - 1} days)`;

      tiers.push({
        policy_key: tierKey,
        policy_name: tierName,
        value_type: 'percentage',
        value: percentages[i],
        days_from_booking_min: min,
        days_from_booking_max: max,
      });

      prevMax = max !== null ? max : 999999;
    }

    // Batch replace: deactivates old policies, creates new ones in a transaction
    const response = await policiesApi.batchReplace(policyType, tiers);

    return (response.data?.policies || []).map((p: any) => ({
      id: p.id,
      policy_key: p.policy_key,
      percentage: p.value,
      days_min: p.days_from_booking_min ?? 0,
      days_max: p.days_from_booking_max ?? null,
    }));
  }

  async function saveSettings() {
    try {
      setSaving(true);

      // Save non-policy settings to settings table
      const settingsToSave = [
        {
          key: 'salesman_permissions',
          value: JSON.stringify(salesmanPermissions),
          type: 'json',
          category: 'permissions',
          description: 'Salesman permissions settings',
        },
        {
          key: 'late_charges_per_day',
          value: lateCharges,
          type: 'number',
          category: 'charges',
          description: 'Late charges per day per apparel',
        },
        {
          key: 'exchange_charges',
          value: exchangeCharges,
          type: 'number',
          category: 'charges',
          description: 'Exchange charges',
        },
        {
          key: 'payment_qr_rent',
          value: rentQrCode,
          type: 'string',
          category: 'payment',
          description: 'UPI QR Code for Rent Collection (base64)',
        },
        {
          key: 'payment_qr_security',
          value: securityQrCode,
          type: 'string',
          category: 'payment',
          description: 'UPI QR Code for Security Deposit Collection (base64)',
        },
      ];

      for (const setting of settingsToSave) {
        try {
          await settingsApi.update(setting.key, {
            setting_key: setting.key,
            setting_value: setting.value,
            setting_type: setting.type,
            category: setting.category,
            description: setting.description,
          });
        } catch (error) {
          // If update fails, try creating
          try {
            await settingsApi.create({
              setting_key: setting.key,
              setting_value: setting.value,
              setting_type: setting.type,
              category: setting.category,
              description: setting.description,
            });
          } catch (createError) {
            console.error(`Error creating setting ${setting.key}:`, createError);
          }
        }
      }

      // Save late fee policy to rental_policies table
      try {
        const lateFeeData = {
          policy_key: lateFeePolicy?.policy_key || 'late_fee_default',
          policy_name: lateFeePolicy?.policy_name || 'Default Late Fee',
          policy_type: 'late_fee' as const,
          value_type: 'fixed' as const,
          value: lateFeeValue ? parseFloat(lateFeeValue) : 200,
          days_from_booking_min: null,
          days_from_booking_max: null,
        };

        if (lateFeePolicy?.id) {
          await policiesApi.update(lateFeePolicy.id, lateFeeData);
        } else {
          await policiesApi.upsert(lateFeeData);
        }
      } catch (error) {
        console.error('Error saving late fee policy:', error);
        throw error;
      }

      toast.success('Settings saved successfully!');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Error saving settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(permission: keyof SalesmanPermissions) {
    setSalesmanPermissions({
      ...salesmanPermissions,
      [permission]: !salesmanPermissions[permission],
    });
  }

  function openEditModal(type: 'exchange' | 'cancellation') {
    setEditingPolicyType(type);
    const tiers = type === 'exchange' ? exchangeTiers : cancellationTiers;
    const { days, percentages } = tiersToDisplay(tiers);

    setModalPenalties([...percentages]);
    setModalDays([...days]);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingPolicyType(null);
  }

  async function saveModalChanges() {
    if (!editingPolicyType) return;

    try {
      const policyType = editingPolicyType === 'exchange' ? 'exchange_penalty' : 'cancellation_penalty';

      const savedTiers = await savePolicyTiers(
        policyType as 'exchange_penalty' | 'cancellation_penalty',
        modalDays,
        modalPenalties
      );

      if (editingPolicyType === 'exchange') {
        setExchangeTiers(savedTiers);
      } else {
        setCancellationTiers(savedTiers);
      }

      toast.success('Policy saved successfully!');
      closeEditModal();
    } catch (error: any) {
      console.error('Error saving policy:', error);
      toast.error(error?.response?.data?.details || error?.response?.data?.error || 'Error saving policy. Please try again.');
    }
  }

  // Helper: get display values from tiers
  function getDisplayValues(tiers: PolicyTier[]): { days: number[]; percentages: number[] } {
    return tiersToDisplay(tiers);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Settings & Policies</h1>
        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const exchangeDisplay = getDisplayValues(exchangeTiers);
  const cancellationDisplay = getDisplayValues(cancellationTiers);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings & Policies</h1>

      {/* Exchange Policy Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Exchange Policy</h2>
          <button
            onClick={() => openEditModal('exchange')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            EDIT
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Penalty:</p>
            <div className="relative h-14 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg overflow-hidden mb-2">
              <div className="absolute inset-0 grid grid-cols-4 gap-6 px-0">
                {exchangeDisplay.percentages.map((pct, i) => (
                  <div key={i} className="flex items-center justify-center">
                    <span className="text-xs font-bold text-white drop-shadow-lg">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Within Days (From Date of Booking):</p>
            <div className="grid grid-cols-4 gap-6">
              {exchangeDisplay.days.map((day, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs text-gray-600 mb-2">
                    {day === -1
                      ? `After ${exchangeDisplay.days[i - 1] || 7} days`
                      : `Within ${day} days`}
                  </p>
                  <p className="text-base font-semibold text-gray-900">{exchangeDisplay.percentages[i]}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation Policy Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Cancellation Policy</h2>
          <button
            onClick={() => openEditModal('cancellation')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            EDIT
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Penalty:</p>
            <div className="relative h-14 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg overflow-hidden mb-2">
              <div className="absolute inset-0 grid grid-cols-4 gap-6 px-0">
                {cancellationDisplay.percentages.map((pct, i) => (
                  <div key={i} className="flex items-center justify-center">
                    <span className="text-xs font-bold text-white drop-shadow-lg">{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Within Days (From Date of Booking):</p>
            <div className="grid grid-cols-4 gap-6">
              {cancellationDisplay.days.map((day, i) => (
                <div key={i} className="text-center">
                  <p className="text-xs text-gray-600 mb-2">
                    {day === -1
                      ? `After ${cancellationDisplay.days[i - 1] || 7} days`
                      : `Within ${day} days`}
                  </p>
                  <p className="text-base font-semibold text-gray-900">{cancellationDisplay.percentages[i]}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Salesman Permissions Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-5">Salesman Permissions</h2>
        <div className="space-y-0">
          {/* Rental price update */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Rental price update</span>
            <button
              onClick={() => togglePermission('rental_price_update')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.rental_price_update ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.rental_price_update ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Cancellation Allowed */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Cancellation Allowed</span>
            <button
              onClick={() => togglePermission('cancellation_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.cancellation_allowed ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.cancellation_allowed ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Exchange Allowed */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Exchange Allowed</span>
            <button
              onClick={() => togglePermission('exchange_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.exchange_allowed ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.exchange_allowed ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Update Payment Methods */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Update Payment Methods</span>
            <button
              onClick={() => togglePermission('update_payment_methods')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.update_payment_methods ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.update_payment_methods ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Discount Allowed */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-gray-700">Discount Allowed</span>
            <button
              onClick={() => togglePermission('discount_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.discount_allowed ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.discount_allowed ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Charges Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800 mb-5">Charges</h2>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Late Charges per Day per Apparel*
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={lateCharges}
                onChange={(e) => setLateCharges(e.target.value)}
                placeholder="Enter"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Exchange Charges*
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={exchangeCharges}
                onChange={(e) => setExchangeCharges(e.target.value)}
                placeholder="Enter"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Late Fee Policy Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Late Fee Policy</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure the late fee charged per day when products are returned after their scheduled return date
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Late Fee per Day (₹)*
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                value={lateFeeValue}
                onChange={(e) => setLateFeeValue(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Fixed amount charged per day for late returns (e.g., ₹200/day). This fee is automatically calculated and applied by the system when products are returned after their scheduled date.
            </p>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Late fees are automatically calculated by the backend when products are returned. The system multiplies this daily rate by the number of days delayed.
            </p>
          </div>
        </div>
      </div>

      {/* Payment QR Codes Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Payment QR Codes</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload separate UPI QR codes for rent collection and security deposit collection. These will be shown on all portals when collecting payments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rent Collection QR */}
          <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
            <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
              📋 Rent Collection QR
            </h3>
            <div className="flex flex-col items-center">
              {rentQrCode ? (
                <div className="relative group mb-3">
                  <img src={rentQrCode} alt="Rent QR" className="w-40 h-40 object-contain border-2 border-blue-200 rounded-lg bg-white p-2" />
                  <button onClick={() => setRentQrCode('')} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700" title="Remove">×</button>
                </div>
              ) : (
                <div className="w-40 h-40 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center text-blue-400 bg-white mb-3">
                  <svg className="w-10 h-10 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-xs">No QR uploaded</span>
                </div>
              )}
              <input ref={rentQrFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Image too large (max 5MB).'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => { setRentQrCode(ev.target?.result as string); toast.success('Rent QR loaded! Click Save Changes to apply.'); };
                reader.readAsDataURL(file);
              }} />
              <button onClick={() => rentQrFileInputRef.current?.click()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                📷 {rentQrCode ? 'Change' : 'Upload'}
              </button>
            </div>
          </div>

          {/* Security Deposit QR */}
          <div className="border border-green-200 rounded-lg p-4 bg-green-50/30">
            <h3 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
              🔒 Security Deposit QR
            </h3>
            <div className="flex flex-col items-center">
              {securityQrCode ? (
                <div className="relative group mb-3">
                  <img src={securityQrCode} alt="Security QR" className="w-40 h-40 object-contain border-2 border-green-200 rounded-lg bg-white p-2" />
                  <button onClick={() => setSecurityQrCode('')} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700" title="Remove">×</button>
                </div>
              ) : (
                <div className="w-40 h-40 border-2 border-dashed border-green-300 rounded-lg flex flex-col items-center justify-center text-green-400 bg-white mb-3">
                  <svg className="w-10 h-10 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-xs">No QR uploaded</span>
                </div>
              )}
              <input ref={securityQrFileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { toast.error('Image too large (max 5MB).'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => { setSecurityQrCode(ev.target?.result as string); toast.success('Security QR loaded! Click Save Changes to apply.'); };
                reader.readAsDataURL(file);
              }} />
              <button onClick={() => securityQrFileInputRef.current?.click()} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                📷 {securityQrCode ? 'Change' : 'Upload'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mt-4">
          <p className="text-xs text-amber-800">
            <strong>Note:</strong> After uploading, click <strong>SAVE CHANGES</strong> below to apply. Rent QR is shown for rent/penalty payments, Security QR is shown for security deposit collection.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Saving...' : 'SAVE CHANGES'}
        </button>
      </div>

      {/* Edit Policy Modal */}
      {showEditModal && editingPolicyType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                Edit {editingPolicyType === 'exchange' ? 'Exchange' : 'Cancellation'} Policy
              </h2>
              <button
                onClick={closeEditModal}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="flex gap-6 items-start">
                {/* Left Section: Penalty (in %) */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    {editingPolicyType === 'exchange' ? 'Exchange Penalty ( % of Total Rental )' : 'Cancellation Penalty ( % of Total Rental )'}
                  </h3>
                  <div className="space-y-0">
                    {modalPenalties.map((penalty, index) => (
                      <div key={index} className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={penalty}
                          onChange={(e) => {
                            const newPenalties = [...modalPenalties];
                            newPenalties[index] = parseInt(e.target.value) || 0;
                            setModalPenalties(newPenalties);
                          }}
                          placeholder="Enter"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                        />
                        {index < modalPenalties.length - 1 && (
                          <div className="mt-4 mb-4 border-t border-dashed border-gray-400"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vertical Gradient Bar */}
                <div className="w-3 h-full bg-gradient-to-b from-red-500 via-orange-500 via-yellow-500 to-green-500 rounded-full flex-shrink-0"></div>

                {/* Right Section: Days (in days) */}
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Within Days ( From Date Of Booking )
                  </h3>
                  <div className="space-y-0">
                    {modalDays.map((day, index) => (
                      <div key={index} className="relative">
                        {day === -1 ? (
                          <input
                            type="text"
                            value={`after ${modalDays[index - 1] || 7} days`}
                            readOnly
                            className="w-full px-4 py-2.5 border border-red-500 rounded-lg bg-white text-gray-700 cursor-default"
                          />
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={day}
                            onChange={(e) => {
                              const newDays = [...modalDays];
                              const value = parseInt(e.target.value) || 0;
                              newDays[index] = value;
                              setModalDays(newDays);
                            }}
                            placeholder="Enter"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                          />
                        )}
                        {index < modalDays.length - 1 && (
                          <div className="mt-4 mb-4 border-t border-dashed border-gray-400"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-4 p-6 border-t border-gray-200">
              <button
                onClick={closeEditModal}
                className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={saveModalChanges}
                className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
