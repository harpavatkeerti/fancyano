'use client';

import { useState, useEffect } from 'react';
import { settingsApi } from '@/lib/settingsApi';
import { Button, Input } from '@/components/common';
import { toast } from '@/lib/toast';

interface RefundPolicy {
  booked_date: number; // 0% - More than 7 days before
  before_7_days: number; // 0% - 7 days before
  before_3_days: number; // 50% - 3 days before
  before_1_day: number; // 75% - 1 day before
  on_booking_date: number; // 100% - On booking date
  days?: number[]; // [7, 3, 1, -1] - Days values
}

interface CancellationPolicy {
  booked_date: number; // 0% - More than 7 days before
  before_7_days: number; // 0% - 7 days before
  before_3_days: number; // 50% - 3 days before
  before_1_day: number; // 75% - 1 day before
  on_booking_date: number; // 100% - On booking date
  days?: number[]; // [7, 3, 1, -1] - Days values
}

interface SalesmanPermissions {
  rental_price_update: boolean;
  cancellation_allowed: boolean;
  exchange_allowed: boolean;
  update_payment_methods: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRefund, setEditingRefund] = useState(false);
  const [editingCancellation, setEditingCancellation] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPolicyType, setEditingPolicyType] = useState<'refund' | 'cancellation' | null>(null);
  
  // Modal state for editing
  const [modalPenalties, setModalPenalties] = useState<number[]>([0, 10, 20, 50]);
  const [modalDays, setModalDays] = useState<number[]>([3, 5, 7, -1]);
  
  const [refundPolicy, setRefundPolicy] = useState<RefundPolicy>({
    booked_date: 0,
    before_7_days: 0,    // Within 3 days: 0%
    before_3_days: 10,   // Within 5 days: 10%
    before_1_day: 20,    // Within 7 days: 20%
    on_booking_date: 50, // After 7 days: 50%
    days: [3, 5, 7, -1], // Days thresholds: 3, 5, 7, after 7
  });
  
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy>({
    booked_date: 0,
    before_7_days: 0,    // Within 3 days: 0%
    before_3_days: 10,   // Within 5 days: 10%
    before_1_day: 20,    // Within 7 days: 20%
    on_booking_date: 50, // After 7 days: 50%
    days: [3, 5, 7, -1], // Days thresholds: 3, 5, 7, after 7
  });
  
  const [salesmanPermissions, setSalesmanPermissions] = useState<SalesmanPermissions>({
    rental_price_update: true,
    cancellation_allowed: false,
    exchange_allowed: false,
    update_payment_methods: false,
  });
  
  const [lateCharges, setLateCharges] = useState<string>('');
  const [exchangeCharges, setExchangeCharges] = useState<string>('');
  
  // Delayed charges settings
  const [delayedChargesEnabled, setDelayedChargesEnabled] = useState<boolean>(false);
  const [delayedChargesType, setDelayedChargesType] = useState<'fixed' | 'percentage'>('fixed');
  const [delayedChargesValue, setDelayedChargesValue] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      
      // Fetch refund policy
      try {
        const refundData = await settingsApi.getByKey('refund_policy');
        if (refundData.data?.setting_value) {
          const parsed = JSON.parse(refundData.data.setting_value);
          // Normalize days array to ensure consistent structure: [3, 5, 7, -1]
          if (!parsed.days || parsed.days.length !== 4) {
            parsed.days = [3, 5, 7, -1];
          } else {
            // Ensure the last value is -1 (for "after X days" display)
            parsed.days[3] = -1;
          }
          // Ensure all required fields exist for backward compatibility
          if (parsed.before_7_days === undefined) parsed.before_7_days = 0;
          if (parsed.before_3_days === undefined) parsed.before_3_days = 10;
          if (parsed.before_1_day === undefined) parsed.before_1_day = 20;
          if (parsed.on_booking_date === undefined) parsed.on_booking_date = 50;
          // Remove before_0_days if it exists (cleanup)
          if (parsed.before_0_days !== undefined) {
            delete parsed.before_0_days;
          }
          setRefundPolicy(parsed);
        }
      } catch (error) {
        console.log('Refund policy not found, using defaults');
      }

      // Fetch cancellation policy
      try {
        const cancelData = await settingsApi.getByKey('cancellation_policy');
        if (cancelData.data?.setting_value) {
          const parsed = JSON.parse(cancelData.data.setting_value);
          // Normalize days array to ensure consistent structure: [3, 5, 7, -1]
          if (!parsed.days || parsed.days.length !== 4) {
            parsed.days = [3, 5, 7, -1];
          } else {
            // Ensure the last value is -1 (for "after X days" display)
            parsed.days[3] = -1;
          }
          // Ensure all required fields exist for backward compatibility
          if (parsed.before_7_days === undefined) parsed.before_7_days = 0;
          if (parsed.before_3_days === undefined) parsed.before_3_days = 10;
          if (parsed.before_1_day === undefined) parsed.before_1_day = 20;
          if (parsed.on_booking_date === undefined) parsed.on_booking_date = 50;
          // Remove before_0_days if it exists (cleanup)
          if (parsed.before_0_days !== undefined) {
            delete parsed.before_0_days;
          }
          setCancellationPolicy(parsed);
        }
      } catch (error) {
        console.log('Cancellation policy not found, using defaults');
      }

      // Fetch salesman permissions
      try {
        const permData = await settingsApi.getByKey('salesman_permissions');
        if (permData.data?.setting_value) {
          setSalesmanPermissions(JSON.parse(permData.data.setting_value));
        }
      } catch (error) {
        console.log('Salesman permissions not found, using defaults');
      }

      // Fetch late charges
      try {
        const lateData = await settingsApi.getByKey('late_charges_per_day');
        if (lateData.data?.setting_value) {
          setLateCharges(lateData.data.setting_value);
        }
      } catch (error) {
        console.log('Late charges not found');
      }

      // Fetch exchange charges
      try {
        const exchangeData = await settingsApi.getByKey('exchange_charges');
        if (exchangeData.data?.setting_value) {
          setExchangeCharges(exchangeData.data.setting_value);
        }
      } catch (error) {
        console.log('Exchange charges not found');
      }

      // Fetch delayed charges settings
      try {
        const delayedData = await settingsApi.getByKey('delayed_charges_settings');
        if (delayedData.data?.setting_value) {
          const parsed = JSON.parse(delayedData.data.setting_value);
          setDelayedChargesEnabled(parsed.enabled || false);
          setDelayedChargesType(parsed.type || 'fixed');
          setDelayedChargesValue(parsed.value?.toString() || '');
        }
      } catch (error) {
        console.log('Delayed charges settings not found');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      setSaving(true);

      // Save all settings
      const settingsToSave = [
        {
          key: 'refund_policy',
          value: JSON.stringify(refundPolicy),
          type: 'json',
          category: 'policies',
          description: 'Refund policy with penalty percentages',
        },
        {
          key: 'cancellation_policy',
          value: JSON.stringify(cancellationPolicy),
          type: 'json',
          category: 'policies',
          description: 'Cancellation policy with penalty percentages',
        },
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
          key: 'delayed_charges_settings',
          value: JSON.stringify({
            enabled: delayedChargesEnabled,
            type: delayedChargesType,
            value: delayedChargesValue ? parseFloat(delayedChargesValue) : 0,
          }),
          type: 'json',
          category: 'charges',
          description: 'Delayed return charges configuration (fixed amount or percentage of product rent)',
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

      toast.success('Settings saved successfully!');
      setEditingRefund(false);
      setEditingCancellation(false);
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Error saving settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function updateRefundPolicy(field: keyof RefundPolicy, value: number) {
    setRefundPolicy({ ...refundPolicy, [field]: value });
  }

  function updateCancellationPolicy(field: keyof CancellationPolicy, value: number) {
    setCancellationPolicy({ ...cancellationPolicy, [field]: value });
  }

  function togglePermission(permission: keyof SalesmanPermissions) {
    setSalesmanPermissions({
      ...salesmanPermissions,
      [permission]: !salesmanPermissions[permission],
    });
  }

  function openEditModal(type: 'refund' | 'cancellation') {
    setEditingPolicyType(type);
    const policy = type === 'refund' ? refundPolicy : cancellationPolicy;
    // Set modal values based on current policy - 4 fields mapping to within X days
    // Ensure consistent order and structure for both policies
    const normalizedDays = policy.days && policy.days.length === 4 
      ? policy.days 
      : [3, 5, 7, -1]; // Default: within 3, 5, 7 days, and after 7 days
    
    setModalPenalties([
      policy.before_7_days || 0,
      policy.before_3_days || 10,
      policy.before_1_day || 20,
      policy.on_booking_date || 50,
    ]);
    // Load saved days or use defaults - order: 3, 5, 7, -1 (after X days)
    setModalDays(normalizedDays);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setShowEditModal(false);
    setEditingPolicyType(null);
  }

  async function saveModalChanges() {
    if (!editingPolicyType) return;

    try {
      if (editingPolicyType === 'refund') {
        const updatedPolicy = {
          booked_date: 0, // Not used - placeholder
          before_7_days: modalPenalties[0] || 0,    // Within first threshold (e.g., 3 days)
          before_3_days: modalPenalties[1] || 10,   // Within second threshold (e.g., 5 days)
          before_1_day: modalPenalties[2] || 20,    // Within third threshold (e.g., 7 days)
          on_booking_date: modalPenalties[3] || 50, // After third threshold
          days: modalDays, // Save the days values
        };
        setRefundPolicy(updatedPolicy);
        
        // Save immediately to database
        await settingsApi.update('refund_policy', {
          setting_key: 'refund_policy',
          setting_value: JSON.stringify(updatedPolicy),
          setting_type: 'json',
          category: 'policies',
          description: 'Refund policy with penalty percentages',
        });
      } else {
        const updatedPolicy = {
          booked_date: 0, // Not used - placeholder
          before_7_days: modalPenalties[0] || 0,    // Within first threshold (e.g., 3 days)
          before_3_days: modalPenalties[1] || 10,   // Within second threshold (e.g., 5 days)
          before_1_day: modalPenalties[2] || 20,    // Within third threshold (e.g., 7 days)
          on_booking_date: modalPenalties[3] || 50, // After third threshold
          days: modalDays, // Save the days values
        };
        setCancellationPolicy(updatedPolicy);
        
        // Save immediately to database
        await settingsApi.update('cancellation_policy', {
          setting_key: 'cancellation_policy',
          setting_value: JSON.stringify(updatedPolicy),
          setting_type: 'json',
          category: 'policies',
          description: 'Cancellation policy with penalty percentages',
        });
      }
      
      toast.success('Policy saved successfully!');
      closeEditModal();
    } catch (error: any) {
      console.error('Error saving policy:', error);
      // If update fails, try creating
      try {
        if (editingPolicyType === 'refund') {
          const updatedPolicy = {
            booked_date: 0,
            before_7_days: modalPenalties[0] || 0,
            before_3_days: modalPenalties[1] || 50,
            before_1_day: modalPenalties[2] || 75,
            on_booking_date: modalPenalties[3] || 100,
            days: modalDays,
          };
          setRefundPolicy(updatedPolicy);
          await settingsApi.create({
            setting_key: 'refund_policy',
            setting_value: JSON.stringify(updatedPolicy),
            setting_type: 'json',
            category: 'policies',
            description: 'Refund policy with penalty percentages',
          });
        } else {
          const updatedPolicy = {
            booked_date: 0,
            before_7_days: modalPenalties[0] || 0,
            before_3_days: modalPenalties[1] || 50,
            before_1_day: modalPenalties[2] || 75,
            on_booking_date: modalPenalties[3] || 100,
            days: modalDays,
          };
          setCancellationPolicy(updatedPolicy);
          await settingsApi.create({
            setting_key: 'cancellation_policy',
            setting_value: JSON.stringify(updatedPolicy),
            setting_type: 'json',
            category: 'policies',
            description: 'Cancellation policy with penalty percentages',
          });
        }
        toast.success('Policy saved successfully!');
        closeEditModal();
      } catch (createError) {
        console.error('Error creating policy:', createError);
        toast.error('Error saving policy. Please try again.');
      }
    }
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

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings & Policies</h1>

      {/* Exchange Policy Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Exchange Policy</h2>
          <button
            onClick={() => openEditModal('refund')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            EDIT
          </button>
        </div>
        
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Penalty:</p>
            {/* Penalty Visualization Bar - 4 points perfectly aligned with data below */}
            <div className="relative h-14 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg overflow-hidden mb-2">
              <div className="absolute inset-0 grid grid-cols-4 gap-6 px-0">
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {refundPolicy.before_7_days || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {refundPolicy.before_3_days || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {refundPolicy.before_1_day || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {refundPolicy.on_booking_date || 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Within Days (From Date of Booking):</p>
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {refundPolicy.days?.[0] || 3} days</p>
                <p className="text-base font-semibold text-gray-900">{refundPolicy.before_7_days || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {refundPolicy.days?.[1] || 5} days</p>
                <p className="text-base font-semibold text-gray-900">{refundPolicy.before_3_days || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {refundPolicy.days?.[2] || 7} days</p>
                <p className="text-base font-semibold text-gray-900">{refundPolicy.before_1_day || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">After {refundPolicy.days?.[2] || 7} days</p>
                <p className="text-base font-semibold text-gray-900">{refundPolicy.on_booking_date || 0}%</p>
              </div>
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
            {/* Penalty Visualization Bar - 4 points perfectly aligned with data below */}
            <div className="relative h-14 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-lg overflow-hidden mb-2">
              <div className="absolute inset-0 grid grid-cols-4 gap-6 px-0">
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {cancellationPolicy.before_7_days || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {cancellationPolicy.before_3_days || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {cancellationPolicy.before_1_day || 0}%
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow-lg">
                    {cancellationPolicy.on_booking_date || 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Within Days (From Date of Booking):</p>
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {cancellationPolicy.days?.[0] || 3} days</p>
                <p className="text-base font-semibold text-gray-900">{cancellationPolicy.before_7_days || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {cancellationPolicy.days?.[1] || 5} days</p>
                <p className="text-base font-semibold text-gray-900">{cancellationPolicy.before_3_days || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">Within {cancellationPolicy.days?.[2] || 7} days</p>
                <p className="text-base font-semibold text-gray-900">{cancellationPolicy.before_1_day || 0}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-600 mb-2">After {cancellationPolicy.days?.[2] || 7} days</p>
                <p className="text-base font-semibold text-gray-900">{cancellationPolicy.on_booking_date || 0}%</p>
              </div>
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                salesmanPermissions.rental_price_update ? 'bg-red-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  salesmanPermissions.rental_price_update ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Cancellation Allowed */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Cancellation Allowed</span>
            <button
              onClick={() => togglePermission('cancellation_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                salesmanPermissions.cancellation_allowed ? 'bg-red-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  salesmanPermissions.cancellation_allowed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Exchange Allowed */}
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Exchange Allowed</span>
            <button
              onClick={() => togglePermission('exchange_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                salesmanPermissions.exchange_allowed ? 'bg-red-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  salesmanPermissions.exchange_allowed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Update Payment Methods */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-gray-700">Update Payment Methods</span>
            <button
              onClick={() => togglePermission('update_payment_methods')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                salesmanPermissions.update_payment_methods ? 'bg-red-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  salesmanPermissions.update_payment_methods ? 'translate-x-6' : 'translate-x-1'
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

      {/* Delayed Charges Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-800">Delayed Return Charges</h2>
          <button
            onClick={() => setDelayedChargesEnabled(!delayedChargesEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
              delayedChargesEnabled ? 'bg-red-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                delayedChargesEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {delayedChargesEnabled && (
          <div className="space-y-5 mt-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Charge Type*
              </label>
              <div className="flex gap-6">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="delayedChargesType"
                    value="fixed"
                    checked={delayedChargesType === 'fixed'}
                    onChange={(e) => setDelayedChargesType(e.target.value as 'fixed' | 'percentage')}
                    className="mr-2 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">Fixed Amount (per day)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="delayedChargesType"
                    value="percentage"
                    checked={delayedChargesType === 'percentage'}
                    onChange={(e) => setDelayedChargesType(e.target.value as 'fixed' | 'percentage')}
                    className="mr-2 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">Percentage of Product Rent (per day)</span>
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {delayedChargesType === 'fixed' ? 'Fixed Amount per Day (₹)*' : 'Percentage per Day (%)*'}
              </label>
              <div className="relative">
                {delayedChargesType === 'fixed' && (
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">₹</span>
                )}
                {delayedChargesType === 'percentage' && (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 font-medium">%</span>
                )}
                <input
                  type="number"
                  min="0"
                  step={delayedChargesType === 'fixed' ? '0.01' : '0.1'}
                  value={delayedChargesValue}
                  onChange={(e) => setDelayedChargesValue(e.target.value)}
                  placeholder={delayedChargesType === 'fixed' ? 'Enter amount' : 'Enter percentage'}
                  className={`w-full ${delayedChargesType === 'fixed' ? 'pl-8 pr-4' : 'pl-4 pr-8'} py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500`}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {delayedChargesType === 'fixed' 
                  ? 'Fixed amount charged per day for delayed returns (e.g., ₹100/day)'
                  : 'Percentage of product rental amount charged per day for delayed returns (e.g., 10% of rent per day)'}
              </p>
            </div>
          </div>
        )}
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
                Edit {editingPolicyType === 'refund' ? 'Exchange' : 'Cancellation'} Policy
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
                    {editingPolicyType === 'refund' ? 'Exchange Penalty ( % of Total Rental )' : 'Cancellation Penalty ( % of Total Rental )'}
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
                            value="after 7 days"
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
