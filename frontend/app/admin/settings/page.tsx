'use client';

import { useState, useEffect } from 'react';
import { settingsApi } from '@/lib/settingsApi';
import { Button, Input } from '@/components/common';
import { toast } from '@/lib/toast';

interface DateChangeChargeSettings {
  charge_type: 'fixed' | 'variable' | 'manual';
  fixed_amount: number;
  variable_per_day: number;
  min_charge: number;
  max_charge: number;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dateChangeSettings, setDateChangeSettings] = useState<DateChangeChargeSettings>({
    charge_type: 'manual',
    fixed_amount: 0,
    variable_per_day: 0,
    min_charge: 0,
    max_charge: 0,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      
      // Fetch date change charge settings
      const settings = [
        'date_change_charge_type',
        'date_change_fixed_amount',
        'date_change_variable_per_day',
        'date_change_min_charge',
        'date_change_max_charge',
      ];

      const values: any = {};
      for (const key of settings) {
        try {
          const response = await settingsApi.getByKey(key);
          values[key] = response.data?.setting_value || null;
        } catch (error) {
          console.log(`Setting ${key} not found, using default`);
        }
      }

      setDateChangeSettings({
        charge_type: (values.date_change_charge_type || 'manual') as 'fixed' | 'variable' | 'manual',
        fixed_amount: parseFloat(values.date_change_fixed_amount || '0') || 0,
        variable_per_day: parseFloat(values.date_change_variable_per_day || '0') || 0,
        min_charge: parseFloat(values.date_change_min_charge || '0') || 0,
        max_charge: parseFloat(values.date_change_max_charge || '0') || 0,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      setSaving(true);

      // Save all date change charge settings
      await Promise.all([
        settingsApi.update('date_change_charge_type', {
          setting_key: 'date_change_charge_type',
          setting_value: dateChangeSettings.charge_type,
          category: 'booking_charges',
          description: 'Type of charge for date changes: fixed, variable, or manual',
        }),
        settingsApi.update('date_change_fixed_amount', {
          setting_key: 'date_change_fixed_amount',
          setting_value: String(dateChangeSettings.fixed_amount),
          category: 'booking_charges',
          description: 'Fixed charge amount for date changes (when charge_type is fixed)',
        }),
        settingsApi.update('date_change_variable_per_day', {
          setting_key: 'date_change_variable_per_day',
          setting_value: String(dateChangeSettings.variable_per_day),
          category: 'booking_charges',
          description: 'Charge per day for date changes (when charge_type is variable)',
        }),
        settingsApi.update('date_change_min_charge', {
          setting_key: 'date_change_min_charge',
          setting_value: String(dateChangeSettings.min_charge),
          category: 'booking_charges',
          description: 'Minimum charge for date changes (when charge_type is variable)',
        }),
        settingsApi.update('date_change_max_charge', {
          setting_key: 'date_change_max_charge',
          setting_value: String(dateChangeSettings.max_charge),
          category: 'booking_charges',
          description: 'Maximum charge for date changes (when charge_type is variable)',
        }),
      ]);

      alert('Settings saved successfully!');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      
      // If update fails, try creating the settings
      try {
        await Promise.all([
          settingsApi.create({
            setting_key: 'date_change_charge_type',
            setting_value: dateChangeSettings.charge_type,
            category: 'booking_charges',
            description: 'Type of charge for date changes: fixed, variable, or manual',
          }),
          settingsApi.create({
            setting_key: 'date_change_fixed_amount',
            setting_value: String(dateChangeSettings.fixed_amount),
            category: 'booking_charges',
            description: 'Fixed charge amount for date changes (when charge_type is fixed)',
          }),
          settingsApi.create({
            setting_key: 'date_change_variable_per_day',
            setting_value: String(dateChangeSettings.variable_per_day),
            category: 'booking_charges',
            description: 'Charge per day for date changes (when charge_type is variable)',
          }),
          settingsApi.create({
            setting_key: 'date_change_min_charge',
            setting_value: String(dateChangeSettings.min_charge),
            category: 'booking_charges',
            description: 'Minimum charge for date changes (when charge_type is variable)',
          }),
          settingsApi.create({
            setting_key: 'date_change_max_charge',
            setting_value: String(dateChangeSettings.max_charge),
            category: 'booking_charges',
            description: 'Maximum charge for date changes (when charge_type is variable)',
          }),
        ]);
        toast.success('Settings saved successfully!');
      } catch (createError) {
        console.error('Error creating settings:', createError);
        toast.error('Error saving settings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  function calculateVariableCharge(daysChanged: number): number {
    const baseCharge = daysChanged * dateChangeSettings.variable_per_day;
    const minCharge = dateChangeSettings.min_charge || 0;
    const maxCharge = dateChangeSettings.max_charge || Infinity;
    
    return Math.max(minCharge, Math.min(baseCharge, maxCharge));
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
      <h1 className="text-3xl font-bold text-gray-800">Settings & Policies</h1>

      {/* Date Change Charges Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">📅 Date Change Charges</h2>
        <p className="text-gray-600 mb-6">
          Configure how charges are calculated when booking dates are modified.
        </p>

        <div className="space-y-6">
          {/* Charge Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Charge Type
            </label>
            <select
              value={dateChangeSettings.charge_type}
              onChange={(e) => setDateChangeSettings({
                ...dateChangeSettings,
                charge_type: e.target.value as 'fixed' | 'variable' | 'manual',
              })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="manual">Manual - Admin sets charge each time</option>
              <option value="fixed">Fixed - Same charge for all date changes</option>
              <option value="variable">Variable - Charge based on days changed</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {dateChangeSettings.charge_type === 'manual' && 'Admin will enter charge amount manually when changing dates'}
              {dateChangeSettings.charge_type === 'fixed' && 'A fixed amount will be charged for any date change'}
              {dateChangeSettings.charge_type === 'variable' && 'Charge will be calculated based on number of days changed'}
            </p>
          </div>

          {/* Fixed Amount (shown when charge_type is 'fixed') */}
          {dateChangeSettings.charge_type === 'fixed' && (
            <div>
              <Input
                label="Fixed Charge Amount (₹)"
                type="number"
                min="0"
                step="0.01"
                value={dateChangeSettings.fixed_amount}
                onChange={(e) => setDateChangeSettings({
                  ...dateChangeSettings,
                  fixed_amount: parseFloat(e.target.value) || 0,
                })}
                placeholder="Enter fixed charge amount"
              />
              <p className="text-xs text-gray-500 mt-1">
                This amount will be charged for any date change, regardless of how many days are changed.
              </p>
            </div>
          )}

          {/* Variable Charges (shown when charge_type is 'variable') */}
          {dateChangeSettings.charge_type === 'variable' && (
            <div className="space-y-4">
              <Input
                label="Charge Per Day (₹)"
                type="number"
                min="0"
                step="0.01"
                value={dateChangeSettings.variable_per_day}
                onChange={(e) => setDateChangeSettings({
                  ...dateChangeSettings,
                  variable_per_day: parseFloat(e.target.value) || 0,
                })}
                placeholder="Enter charge per day"
              />
              <p className="text-xs text-gray-500 mt-1">
                Charge will be calculated as: (Days Changed × Charge Per Day), with min/max limits applied.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Minimum Charge (₹)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dateChangeSettings.min_charge}
                  onChange={(e) => setDateChangeSettings({
                    ...dateChangeSettings,
                    min_charge: parseFloat(e.target.value) || 0,
                  })}
                  placeholder="Minimum charge"
                />
                <Input
                  label="Maximum Charge (₹)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dateChangeSettings.max_charge}
                  onChange={(e) => setDateChangeSettings({
                    ...dateChangeSettings,
                    max_charge: parseFloat(e.target.value) || 0,
                  })}
                  placeholder="Maximum charge"
                />
              </div>

              {/* Example Calculation */}
              {dateChangeSettings.variable_per_day > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Example Calculations:</p>
                  <div className="space-y-1 text-xs text-blue-800">
                    <p>• 1 day change: ₹{calculateVariableCharge(1).toLocaleString('en-IN')}</p>
                    <p>• 3 days change: ₹{calculateVariableCharge(3).toLocaleString('en-IN')}</p>
                    <p>• 7 days change: ₹{calculateVariableCharge(7).toLocaleString('en-IN')}</p>
                    <p>• 10 days change: ₹{calculateVariableCharge(10).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Charge Info */}
          {dateChangeSettings.charge_type === 'manual' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Manual Mode:</strong> When changing dates, you'll be prompted to enter the charge amount manually. 
                This gives you full control over charges for each date change.
              </p>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button
              onClick={saveSettings}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
