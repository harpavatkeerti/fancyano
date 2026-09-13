'use client';

import { settingsApi, policiesApi, productCategoriesApi, measurementTemplatesApi, bankAccountsApi, qrCodesApi, ProductCategory, ProductTypeDefinition, MeasurementTemplate, MeasurementTemplateField } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { integerKeyDown, isIntegerInput } from '@/lib/integerInput';

import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';

import { getSizeTypeLabel } from '@/lib/productConstants';

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
  recurring_expenses_allowed: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
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
    recurring_expenses_allowed: false,
  });





  // Late fee policy (from rental_policies table)
  const [lateFeePolicy, setLateFeePolicy] = useState<any>(null);
  const [lateFeeValue, setLateFeeValue] = useState<string>('200');

  // ── Product Categories & Types state ──────────────────────────────────────
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [showAddTypeForm, setShowAddTypeForm] = useState<number | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeSizeType, setNewTypeSizeType] = useState('standard');
  const [editingType, setEditingType] = useState<{ id: number; name: string; size_type: string; measurement_template_id: number | null } | null>(null);

  // ── Measurement Templates state ────────────────────────────────────────────
  const [measurementTemplates, setMeasurementTemplates] = useState<MeasurementTemplate[]>([]);
  const [newTypeMeasurementTemplateId, setNewTypeMeasurementTemplateId] = useState<number | null>(null);

  // ── Measurement Template CRUD state ────────────────────────────────────────
  const [showAddTemplateForm, setShowAddTemplateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateFields, setNewTemplateFields] = useState<{ key: string; label: string; group: string }[]>([{ key: '', label: '', group: '' }]);
  const [editingTemplate, setEditingTemplate] = useState<{ id: number; name: string; fields: { key: string; label: string; group: string }[] } | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
  const [isMeasurementSectionOpen, setIsMeasurementSectionOpen] = useState(false);
  const [isSalesmanPermissionsOpen, setIsSalesmanPermissionsOpen] = useState(false);




  // Bank Accounts Manager
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [showAddBankForm, setShowAddBankForm] = useState(false);
  const [newBankName, setNewBankName] = useState('');
  const [bankLoading, setBankLoading] = useState(false);

  // QR Code Manager
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [showAddQrForm, setShowAddQrForm] = useState(false);
  const [newQr, setNewQr] = useState({ qr_type: 'rent', name: '', bank_account_id: '', qr_image: '' });
  const qrImageInputRef = useRef<HTMLInputElement>(null);
  const [qrLoading, setQrLoading] = useState(false);

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





      // Fetch late fee policy from rental_policies table
      try {
        const policiesResponse = await policiesApi.getAll('late_fee');
        if (policiesResponse.data && policiesResponse.data.length > 0) {
          const policy = policiesResponse.data[0];
          setLateFeePolicy(policy);
          setLateFeeValue(policy.value?.toString() || '200');
        }
      } catch { }

      // Fetch bank accounts and QR codes
      try {
        const [bankRes, qrRes] = await Promise.all([
          bankAccountsApi.list(),
          qrCodesApi.list()
        ]);
        setBankAccounts(bankRes.data);
        setQrCodes(qrRes.data);
      } catch { }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  // ── Product Categories CRUD ────────────────────────────────────────────────

  async function fetchCategories() {
    try {
      const response = await productCategoriesApi.getAll();
      setProductCategories(response.data.categories || []);
    } catch (e: any) {
      console.error('Failed to load product categories:', e);
    }
  }

  async function fetchMeasurementTemplates() {
    try {
      const response = await measurementTemplatesApi.getAll();
      setMeasurementTemplates(response.data || []);
    } catch (e: any) {
      console.error('Failed to load measurement templates:', e);
    }
  }

  // Fetch categories on mount
  useEffect(() => { 
    fetchCategories(); 
    fetchMeasurementTemplates();
  }, []);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await productCategoriesApi.create({ name: newCategoryName.trim() });
      toast.success(`Category "${newCategoryName.trim()}" created`);
      setNewCategoryName('');
      setShowAddCategoryForm(false);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to create category');
    }
  }

  async function handleUpdateCategory(id: number, name: string) {
    try {
      await productCategoriesApi.update(id, { name: name.trim() });
      toast.success('Category updated');
      setEditingCategory(null);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to update category');
    }
  }

  async function handleDeleteCategory(id: number, name: string) {
    if (!confirm(`Delete category "${name}"? This will also deactivate all product types under it.`)) return;
    try {
      await productCategoriesApi.delete(id);
      toast.success(`Category "${name}" deleted`);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to delete category');
    }
  }

  async function handleAddType(categoryId: number) {
    if (!newTypeName.trim()) return;
    try {
      await productCategoriesApi.addType(categoryId, {
        name: newTypeName.trim(),
        size_type: newTypeSizeType,
        measurement_template_id: newTypeMeasurementTemplateId,
      });
      toast.success(`Product type "${newTypeName.trim()}" added`);
      setNewTypeName('');
      setNewTypeSizeType('standard');
      setNewTypeMeasurementTemplateId(null);
      setShowAddTypeForm(null);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to add product type');
    }
  }

  async function handleUpdateType(typeId: number) {
    if (!editingType) return;
    try {
      await productCategoriesApi.updateType(typeId, {
        name: editingType.name.trim(),
        size_type: editingType.size_type,
        measurement_template_id: editingType.measurement_template_id,
      });
      toast.success('Product type updated');
      setEditingType(null);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to update product type');
    }
  }

  async function handleDeleteType(typeId: number, typeName: string) {
    if (!confirm(`Delete product type "${typeName}"? This cannot be undone if products are using it.`)) return;
    try {
      await productCategoriesApi.deleteType(typeId);
      toast.success(`Product type "${typeName}" deleted`);
      fetchCategories();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to delete product type');
    }
  }

  // ── Measurement Templates CRUD ────────────────────────────────────────────

  async function handleAddTemplate() {
    if (!newTemplateName.trim()) return;
    const validFields = newTemplateFields
      .filter(f => f.key.trim() && f.label.trim())
      .map(f => ({ key: f.key.trim(), label: f.label.trim(), ...(f.group.trim() ? { group: f.group.trim() } : {}) }));
    if (validFields.length === 0) { toast.error('At least one field with key and label is required'); return; }
    try {
      await measurementTemplatesApi.create({ name: newTemplateName.trim(), fields: validFields });
      toast.success(`Template "${newTemplateName.trim()}" created`);
      setNewTemplateName('');
      setNewTemplateFields([{ key: '', label: '', group: '' }]);
      setShowAddTemplateForm(false);
      fetchMeasurementTemplates();
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Failed to create template';
      if (error?.response?.status === 409) {
        toast.error('A template with that name already exists');
      } else {
        addAlert(msg);
      }
    }
  }

  async function handleUpdateTemplate() {
    if (!editingTemplate) return;
    const validFields = editingTemplate.fields
      .filter(f => f.key.trim() && f.label.trim())
      .map(f => ({ key: f.key.trim(), label: f.label.trim(), ...(f.group.trim() ? { group: f.group.trim() } : {}) }));
    if (validFields.length === 0) { toast.error('At least one field with key and label is required'); return; }
    try {
      await measurementTemplatesApi.update(editingTemplate.id, {
        name: editingTemplate.name.trim(),
        fields: validFields,
      });
      toast.success('Template updated');
      setEditingTemplate(null);
      fetchMeasurementTemplates();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to update template');
    }
  }

  async function handleDeleteTemplate(id: number, name: string) {
    if (!confirm(`Delete measurement template "${name}"? Product types using this template will no longer have a measurement form.`)) return;
    try {
      await measurementTemplatesApi.delete(id);
      toast.success(`Template "${name}" deleted`);
      fetchMeasurementTemplates();
    } catch (error: any) {
      addAlert(error?.response?.data?.error || 'Failed to delete template');
    }
  }

  // ── Bank Accounts CRUD ──────────────────────────────────────────────────

  async function loadBankAccounts() {
    try {
      const res = await bankAccountsApi.list();
      setBankAccounts(res.data);
    } catch { }
  }

  async function handleCreateBankAccount() {
    if (!newBankName.trim()) { toast.error('Account name is required'); return; }
    setBankLoading(true);
    try {
      await bankAccountsApi.create({ account_name: newBankName.trim() });
      toast.success('Bank account added');
      setNewBankName('');
      setShowAddBankForm(false);
      loadBankAccounts();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add bank account');
    } finally {
      setBankLoading(false);
    }
  }

  async function handleDeleteBankAccount(id: number, name: string) {
    if (!confirm(`Delete bank account "${name}"? All linked QR codes must be removed first.`)) return;
    try {
      await bankAccountsApi.delete(id);
      toast.success('Bank account deleted');
      loadBankAccounts();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to delete bank account');
    }
  }

  // ── QR Codes CRUD ───────────────────────────────────────────────────────

  async function loadQrCodes() {
    try {
      const res = await qrCodesApi.list();
      setQrCodes(res.data);
    } catch { }
  }

  async function handleCreateQrCode() {
    if (!newQr.name.trim()) { toast.error('QR name is required'); return; }
    if (!newQr.bank_account_id) { toast.error('Select a bank account'); return; }
    if (!newQr.qr_image) { toast.error('Upload a QR image'); return; }
    setQrLoading(true);
    try {
      await qrCodesApi.create({
        qr_type: newQr.qr_type,
        name: newQr.name.trim(),
        bank_account_id: parseInt(newQr.bank_account_id),
        qr_image: newQr.qr_image
      });
      toast.success('QR code added');
      setNewQr({ qr_type: 'rent', name: '', bank_account_id: '', qr_image: '' });
      setShowAddQrForm(false);
      loadQrCodes();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to add QR code');
    } finally {
      setQrLoading(false);
    }
  }

  async function handleActivateQr(id: number) {
    try {
      await qrCodesApi.activate(id);
      toast.success('QR code activated');
      loadQrCodes();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to activate QR code');
    }
  }

  async function handleDeactivateQr(id: number) {
    try {
      await qrCodesApi.deactivate(id);
      toast.success('QR code deactivated');
      loadQrCodes();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to deactivate QR code');
    }
  }

  async function handleDeleteQr(id: number) {
    if (!confirm('Delete this QR code?')) return;
    try {
      await qrCodesApi.delete(id);
      toast.success('QR code deleted');
      loadQrCodes();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to delete QR code');
    }
  }

  function handleQrImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setNewQr(prev => ({ ...prev, qr_image: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
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
      addAlert('Error saving settings. Please try again.');
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
      addAlert(error?.response?.data?.details || error?.response?.data?.error || 'Error saving policy. Please try again.');
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
      {/* Inline alert banner for settings errors */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} />
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings & Policies</h1>

      {/* Exchange Policy Section */}

      {/* ═══ Product Categories & Types ═══ */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Product Categories & Types</h2>
            <p className="text-sm text-gray-500 mt-1">Manage Men, Women, Kids categories and their product types (Sherwani, Lehenga, etc.)</p>
          </div>
          <button
            onClick={() => { setShowAddCategoryForm(true); setNewCategoryName(''); }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            + Add Category
          </button>
        </div>

        {/* Add category form */}
        {showAddCategoryForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name (e.g. Kids, Unisex)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddCategoryForm(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Categories list */}
        {productCategories.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No categories yet. Click "+ Add Category" to create one.</p>
        ) : (
          <div className="space-y-3">
            {productCategories.map((cat) => {
              const isExpanded = expandedCategory === cat.id;
              // Filter out neutral types for display under each category
              const categoryTypes = cat.types.filter(t => t.category_id === cat.id);
              const neutralTypes = cat.types.filter(t => t.category_id === null);

              return (
                <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Category header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                      {editingCategory?.id === cat.id ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editingCategory.name}
                            onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(cat.id, editingCategory.name)}
                          />
                          <button onClick={() => handleUpdateCategory(cat.id, editingCategory.name)} className="text-green-600 hover:text-green-700 text-sm font-medium">Save</button>
                          <button onClick={() => setEditingCategory(null)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                        </div>
                      ) : (
                        <span className="font-semibold text-gray-800">{cat.name}</span>
                      )}
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                        {categoryTypes.length} type{categoryTypes.length !== 1 ? 's' : ''}
                        {neutralTypes.length > 0 && ` + ${neutralTypes.length} shared`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded: product types */}
                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-gray-200">
                      {/* Category-specific types */}
                      {categoryTypes.length === 0 && (
                        <p className="text-gray-400 text-sm italic mb-3">No product types yet for this category.</p>
                      )}
                      <div className="space-y-2">
                        {categoryTypes.map((type) => (
                          <div key={type.id} className="flex items-center justify-between py-2 px-3 bg-white rounded border border-gray-100">
                            {editingType?.id === type.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  type="text"
                                  value={editingType.name}
                                  onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-red-500"
                                  autoFocus
                                />
                                <select
                                  value={editingType.size_type}
                                  onChange={(e) => setEditingType({ ...editingType, size_type: e.target.value })}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  <option value="numeric">Numeric (34–46)</option>
                                  <option value="standard">Standard (S–XXL)</option>
                                  <option value="fancy">Age-Based</option>
                                  <option value="none">No Sizes</option>
                                </select>
                                <select
                                  value={editingType.measurement_template_id ?? ''}
                                  onChange={(e) => setEditingType({ ...editingType, measurement_template_id: e.target.value ? parseInt(e.target.value) : null })}
                                  className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                >
                                  <option value="">No Template</option>
                                  {measurementTemplates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <button onClick={() => handleUpdateType(type.id)} className="text-green-600 hover:text-green-700 text-sm font-medium">Save</button>
                                <button onClick={() => setEditingType(null)} className="text-gray-500 hover:text-gray-700 text-sm">Cancel</button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-gray-800">{type.name}</span>
                                  <span className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded">{getSizeTypeLabel(type.size_type)}</span>
                                  {type.measurement_template_id && (
                                    <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                                      📏 {measurementTemplates.find(t => t.id === type.measurement_template_id)?.name || 'Template'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setEditingType({ id: type.id, name: type.name, size_type: type.size_type, measurement_template_id: type.measurement_template_id ?? null })}
                                    className="text-blue-600 hover:text-blue-700 text-xs"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteType(type.id, type.name)}
                                    className="text-red-600 hover:text-red-700 text-xs"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Neutral types (read-only under each category) */}
                      {neutralTypes.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                          <p className="text-xs text-gray-500 mb-2 font-medium">Shared types (shown for all categories):</p>
                          <div className="flex flex-wrap gap-2">
                            {neutralTypes.map((type) => (
                              <span key={type.id} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                                {type.name} · {getSizeTypeLabel(type.size_type)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add product type form */}
                      {showAddTypeForm === cat.id ? (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newTypeName}
                              onChange={(e) => setNewTypeName(e.target.value)}
                              placeholder="Product type name (e.g. Designer Lehenga)"
                              className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                              autoFocus
                              onKeyDown={(e) => e.key === 'Enter' && handleAddType(cat.id)}
                            />
                            <select
                              value={newTypeSizeType}
                              onChange={(e) => setNewTypeSizeType(e.target.value)}
                              className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <option value="numeric">Numeric (34–46)</option>
                              <option value="standard">Standard (S–XXL)</option>
                              <option value="fancy">Age-Based</option>
                              <option value="none">No Sizes</option>
                            </select>
                            <select
                              value={newTypeMeasurementTemplateId ?? ''}
                              onChange={(e) => setNewTypeMeasurementTemplateId(e.target.value ? parseInt(e.target.value) : null)}
                              className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                              <option value="">No Measurement Template</option>
                              {measurementTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddType(cat.id)}
                              disabled={!newTypeName.trim()}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setShowAddTypeForm(null); setNewTypeName(''); setNewTypeMeasurementTemplateId(null); }}
                              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowAddTypeForm(cat.id); setNewTypeName(''); setNewTypeSizeType('standard'); }}
                          className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          + Add Product Type
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ Measurement Templates ═══ */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setIsMeasurementSectionOpen(!isMeasurementSectionOpen)}
          className="w-full flex justify-between items-center p-6 text-left hover:bg-gray-50 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-3">
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isMeasurementSectionOpen ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Measurement Templates</h2>
              <p className="text-sm text-gray-500 mt-1">Define measurement forms for product types (e.g. Sherwani needs waist, chest, sleeves)</p>
            </div>
          </div>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
            {measurementTemplates.length} template{measurementTemplates.length !== 1 ? 's' : ''}
          </span>
        </button>

        {isMeasurementSectionOpen && (
        <div className="px-6 pb-6">
        <div className="flex justify-end mb-4">
          <button
            onClick={() => { setShowAddTemplateForm(true); setNewTemplateName(''); setNewTemplateFields([{ key: '', label: '', group: '' }]); }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
          >
            + Add Template
          </button>
        </div>

        {/* Add template form */}
        {showAddTemplateForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Sherwani Measurements"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">Fields</label>
            <div className="space-y-2 mb-3">
              {newTemplateFields.map((field, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) => {
                      const updated = [...newTemplateFields];
                      updated[idx] = { ...updated[idx], key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') };
                      setNewTemplateFields(updated);
                    }}
                    placeholder="key (e.g. waist)"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => {
                      const updated = [...newTemplateFields];
                      updated[idx] = { ...updated[idx], label: e.target.value };
                      setNewTemplateFields(updated);
                    }}
                    placeholder="Label (e.g. Waist)"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <input
                    type="text"
                    value={field.group}
                    onChange={(e) => {
                      const updated = [...newTemplateFields];
                      updated[idx] = { ...updated[idx], group: e.target.value };
                      setNewTemplateFields(updated);
                    }}
                    placeholder="Group (optional)"
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  {newTemplateFields.length > 1 && (
                    <button
                      onClick={() => setNewTemplateFields(newTemplateFields.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 text-sm px-1"
                      title="Remove field"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setNewTemplateFields([...newTemplateFields, { key: '', label: '', group: '' }])}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-3"
            >
              + Add Field
            </button>

            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleAddTemplate}
                disabled={!newTemplateName.trim() || newTemplateFields.filter(f => f.key.trim() && f.label.trim()).length === 0}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Create Template
              </button>
              <button
                onClick={() => setShowAddTemplateForm(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Template list */}
        {measurementTemplates.length === 0 && !showAddTemplateForm ? (
          <p className="text-gray-400 text-sm italic">No measurement templates yet. Click "+ Add Template" to create one.</p>
        ) : (
          <div className="space-y-2">
            {measurementTemplates.map((template) => {
              const isExpTpl = expandedTemplate === template.id;
              const isEditing = editingTemplate?.id === template.id;

              return (
                <div key={template.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Template header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <button
                      onClick={() => setExpandedTemplate(isExpTpl ? null : template.id)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <svg
                        className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpTpl ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm font-medium text-gray-800">📏 {template.name}</span>
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                        {template.fields.length} field{template.fields.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingTemplate({
                            id: template.id,
                            name: template.name,
                            fields: template.fields.map(f => ({ key: f.key, label: f.label, group: f.group || '' })),
                          });
                          setExpandedTemplate(template.id);
                        }}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                        className="text-red-600 hover:text-red-700 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Template details (expanded) */}
                  {isExpTpl && (
                    <div className="px-4 py-3 border-t border-gray-200">
                      {isEditing ? (
                        /* Edit mode */
                        <div>
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Template Name</label>
                            <input
                              type="text"
                              value={editingTemplate.name}
                              onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            />
                          </div>

                          <label className="block text-xs font-medium text-gray-600 mb-2">Fields</label>
                          <div className="space-y-2 mb-3">
                            {editingTemplate.fields.map((field, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={field.key}
                                  onChange={(e) => {
                                    const updated = [...editingTemplate.fields];
                                    updated[idx] = { ...updated[idx], key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') };
                                    setEditingTemplate({ ...editingTemplate, fields: updated });
                                  }}
                                  placeholder="key"
                                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) => {
                                    const updated = [...editingTemplate.fields];
                                    updated[idx] = { ...updated[idx], label: e.target.value };
                                    setEditingTemplate({ ...editingTemplate, fields: updated });
                                  }}
                                  placeholder="Label"
                                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                                <input
                                  type="text"
                                  value={field.group}
                                  onChange={(e) => {
                                    const updated = [...editingTemplate.fields];
                                    updated[idx] = { ...updated[idx], group: e.target.value };
                                    setEditingTemplate({ ...editingTemplate, fields: updated });
                                  }}
                                  placeholder="Group (optional)"
                                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                                />
                                {editingTemplate.fields.length > 1 && (
                                  <button
                                    onClick={() => setEditingTemplate({ ...editingTemplate, fields: editingTemplate.fields.filter((_, i) => i !== idx) })}
                                    className="text-red-500 hover:text-red-700 text-sm px-1"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            onClick={() => setEditingTemplate({ ...editingTemplate, fields: [...editingTemplate.fields, { key: '', label: '', group: '' }] })}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-3"
                          >
                            + Add Field
                          </button>

                          <div className="flex items-center gap-3 mt-2">
                            <button
                              onClick={() => handleUpdateTemplate()}
                              disabled={!editingTemplate.name.trim() || editingTemplate.fields.filter(f => f.key.trim() && f.label.trim()).length === 0}
                              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              Save Changes
                            </button>
                            <button
                              onClick={() => setEditingTemplate(null)}
                              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Read-only view */
                        <div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500 border-b">
                                <th className="pb-2 font-medium">Key</th>
                                <th className="pb-2 font-medium">Label</th>
                                <th className="pb-2 font-medium">Group</th>
                              </tr>
                            </thead>
                            <tbody>
                              {template.fields.map((field, idx) => (
                                <tr key={idx} className="border-b border-gray-100 last:border-0">
                                  <td className="py-1.5 font-mono text-xs text-gray-700">{field.key}</td>
                                  <td className="py-1.5 text-gray-800">{field.label}</td>
                                  <td className="py-1.5 text-gray-500">{field.group || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
        )}
      </div>

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <button
          onClick={() => setIsSalesmanPermissionsOpen(!isSalesmanPermissionsOpen)}
          className="w-full flex justify-between items-center p-6 text-left hover:bg-gray-50 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-3">
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isSalesmanPermissionsOpen ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Salesman Permissions</h2>
              <p className="text-sm text-gray-500 mt-1">Control what actions salesmen can perform</p>
            </div>
          </div>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
            {Object.values(salesmanPermissions).filter(Boolean).length} of {Object.keys(salesmanPermissions).length} enabled
          </span>
        </button>

        {isSalesmanPermissionsOpen && (
        <div className="px-6 pb-6">
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
          <div className="flex items-center justify-between py-3 border-b border-gray-200">
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

          {/* Recurring Expenses Allowed */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-gray-700">Recurring Expenses Allowed</span>
            <button
              onClick={() => togglePermission('recurring_expenses_allowed')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${salesmanPermissions.recurring_expenses_allowed ? 'bg-red-600' : 'bg-gray-300'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${salesmanPermissions.recurring_expenses_allowed ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

        </div>
        </div>
        )}
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
                onChange={(e) => {
                  const val = e.target.value;
                  if (isIntegerInput(val)) {
                    setLateFeeValue(val);
                  }
                }}
                onKeyDown={integerKeyDown(() => lateFeeValue, setLateFeeValue)}
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

      {/* Bank Accounts Manager */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">🏦 Bank Accounts</h2>
          <button
            onClick={() => setShowAddBankForm(!showAddBankForm)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAddBankForm ? 'Cancel' : '+ Add Bank Account'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Manage bank accounts that QR codes are linked to.</p>

        {showAddBankForm && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <input
              type="text"
              value={newBankName}
              onChange={e => setNewBankName(e.target.value)}
              placeholder="Bank Account Name (e.g., HDFC Savings)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              onKeyDown={e => e.key === 'Enter' && handleCreateBankAccount()}
            />
            <button
              onClick={handleCreateBankAccount}
              disabled={bankLoading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {bankLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No bank accounts added yet</p>
          ) : bankAccounts.map(ba => (
            <div key={ba.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">
                  {ba.account_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{ba.account_name}</p>
                  <p className="text-xs text-gray-400">
                    {ba.qr_code_count || 0} QR code{ba.qr_code_count !== 1 ? 's' : ''} linked
                    {!ba.is_active && <span className="ml-2 text-red-500">(Inactive)</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteBankAccount(ba.id, ba.account_name)}
                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code Manager */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">📱 QR Code Manager</h2>
          <button
            onClick={() => setShowAddQrForm(!showAddQrForm)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAddQrForm ? 'Cancel' : '+ Add QR Code'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Manage QR codes linked to bank accounts. Only one QR code per type (rent/security) can be active at a time.</p>

        {showAddQrForm && (
          <div className="p-4 mb-4 bg-gray-50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={newQr.qr_type}
                onChange={e => setNewQr(prev => ({ ...prev, qr_type: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              >
                <option value="rent">Rent Collection</option>
                <option value="security">Security Deposit</option>
              </select>
              <input
                type="text"
                value={newQr.name}
                onChange={e => setNewQr(prev => ({ ...prev, name: e.target.value }))}
                placeholder="QR Code Name"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <select
                value={newQr.bank_account_id}
                onChange={e => setNewQr(prev => ({ ...prev, bank_account_id: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              >
                <option value="">Select Bank Account</option>
                {bankAccounts.filter(ba => ba.is_active).map(ba => (
                  <option key={ba.id} value={ba.id}>{ba.account_name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              {newQr.qr_image ? (
                <img src={newQr.qr_image} alt="QR Preview" className="w-20 h-20 object-contain border rounded-lg bg-white p-1" />
              ) : (
                <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                  No image
                </div>
              )}
              <input ref={qrImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrImageUpload} />
              <button
                onClick={() => qrImageInputRef.current?.click()}
                className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors"
              >
                📷 Upload QR Image
              </button>
              <button
                onClick={handleCreateQrCode}
                disabled={qrLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ml-auto"
              >
                {qrLoading ? 'Adding...' : 'Add QR Code'}
              </button>
            </div>
          </div>
        )}

        {/* QR Codes List */}
        <div className="space-y-3">
          {qrCodes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No QR codes added yet. Add a bank account first, then create QR codes.</p>
          ) : qrCodes.map(qr => (
            <div key={qr.id} className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${qr.is_active ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
              <img src={qr.qr_image} alt={qr.name} className="w-16 h-16 object-contain rounded-lg border bg-white p-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{qr.name}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${qr.qr_type === 'rent' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {qr.qr_type === 'rent' ? 'Rent' : 'Security'}
                  </span>
                  {qr.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">Active</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Bank: {qr.bank_account_name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {qr.is_active ? (
                  <button onClick={() => handleDeactivateQr(qr.id)} className="px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 text-xs font-medium rounded-lg transition-colors">
                    Deactivate
                  </button>
                ) : (
                  <button onClick={() => handleActivateQr(qr.id)} className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium rounded-lg transition-colors">
                    Activate
                  </button>
                )}
                <button onClick={() => handleDeleteQr(qr.id)} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors">
                  Delete
                </button>
              </div>
            </div>
          ))}
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
                            const val = e.target.value;
                            if (isIntegerInput(val)) {
                              const newPenalties = [...modalPenalties];
                              newPenalties[index] = parseInt(val) || 0;
                              setModalPenalties(newPenalties);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === '.' || e.key === 'e' || e.key === 'E') {
                              e.preventDefault();
                              return;
                            }
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault();
                              const current = penalty;
                              const next = e.key === 'ArrowUp' ? Math.min(100, current + 1) : Math.max(0, current - 1);
                              const newPenalties = [...modalPenalties];
                              newPenalties[index] = next;
                              setModalPenalties(newPenalties);
                            }
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
                              const val = e.target.value;
                              if (isIntegerInput(val)) {
                                const newDays = [...modalDays];
                                newDays[index] = parseInt(val) || 0;
                                setModalDays(newDays);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === '.' || e.key === 'e' || e.key === 'E') {
                                e.preventDefault();
                                return;
                              }
                              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const current = day;
                                const next = e.key === 'ArrowUp' ? current + 1 : Math.max(0, current - 1);
                                const newDays = [...modalDays];
                                newDays[index] = next;
                                setModalDays(newDays);
                              }
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
