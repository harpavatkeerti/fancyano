'use client';

import { useEffect, useState, useRef } from 'react';
import { vendorsApi, Vendor } from '@/lib/api';
import { Button, Input } from '@/components/common';
import PhoneInput from '@/components/common/PhoneInput';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDateWithOrdinal as formatDate } from '@/lib/dateUtils';
import { GST_REGEX, PAN_REGEX } from '@/lib/vendorValidation';

export default function VendorsPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone_country: 'IN',
    address: '',
    gst_number: '',
    pan_number: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<{ gst_number?: string; pan_number?: string }>({});
  const [duplicateWarnings, setDuplicateWarnings] = useState<Vendor[]>([]);
  const nameMatchedVendorsRef = useRef<Vendor[]>([]);
  const nameSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchVendors();
  }, []);

  async function fetchVendors() {
    try {
      const response = await vendorsApi.getAll();
      setVendors(response.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Frontend validation (backend is authoritative)
    if (!formData.name.trim()) {
      toast.warning('Vendor name is required');
      return;
    }
    if (!formData.phone.trim()) {
      toast.warning('Phone number is required');
      return;
    }
    if (formData.gst_number.trim() && !GST_REGEX.test(formData.gst_number.trim())) {
      toast.warning('Invalid GST number format. Expected format: 22AAAAA0000A1Z5 (15 characters)');
      return;
    }
    if (formData.pan_number.trim() && !PAN_REGEX.test(formData.pan_number.trim())) {
      toast.warning('Invalid PAN number format. Expected format: ABCDE1234F (10 characters)');
      return;
    }
    if (formData.notes.length > 255) {
      toast.warning('Notes must be 255 characters or fewer');
      return;
    }

    try {
      if (editingVendor) {
        await vendorsApi.update(editingVendor.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          phone_country: formData.phone_country,
          address: formData.address.trim() || undefined,
          gst_number: formData.gst_number.trim() || undefined,
          pan_number: formData.pan_number.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        toast.success('Vendor updated successfully');
      } else {
        await vendorsApi.create({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          phone_country: formData.phone_country,
          address: formData.address.trim() || undefined,
          gst_number: formData.gst_number.trim() || undefined,
          pan_number: formData.pan_number.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        toast.success('Vendor created successfully');
      }
      await fetchVendors();
      setShowAddModal(false);
      setEditingVendor(null);
      resetForm();
    } catch (error: any) {
      const msg = error?.response?.data?.error || (editingVendor ? 'Error updating vendor' : 'Error creating vendor');
      toast.error(msg);
    }
  }

  async function handleEdit(vendor: Vendor) {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || '',
      phone: vendor.phone || '',
      phone_country: vendor.phone_country || 'IN',
      address: vendor.address || '',
      gst_number: vendor.gst_number || '',
      pan_number: vendor.pan_number || '',
      notes: vendor.notes || '',
    });
    setFormErrors({});
    setDuplicateWarnings([]);
    setShowAddModal(true);
  }

  async function handleDelete(id: number, vendorName: string) {
    const confirmed = await confirm({
      title: 'Delete Vendor',
      message: `Are you sure you want to delete "${vendorName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) return;

    try {
      await vendorsApi.delete(id);
      await fetchVendors();
      toast.success('Vendor deleted successfully');
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Error deleting vendor';
      toast.error(msg);
    }
  }

  function resetForm() {
    setFormData({ name: '', phone: '', phone_country: 'IN', address: '', gst_number: '', pan_number: '', notes: '' });
    setFormErrors({});
    setDuplicateWarnings([]);
    nameMatchedVendorsRef.current = [];
    if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);
  }

  // Filter name-matched vendors against the current phone to decide if warning should show.
  // If user has entered a phone and it doesn't match any existing vendor's phone, clear warning.
  function filterDuplicates(nameMatches: Vendor[], phone: string) {
    if (nameMatches.length === 0) {
      setDuplicateWarnings([]);
      return;
    }
    // If phone is not yet entered, show all name matches as warnings
    if (!phone.trim()) {
      setDuplicateWarnings(nameMatches);
      return;
    }
    // Filter: only warn if an existing vendor has the same phone
    const phoneMatches = nameMatches.filter(v => v.phone === phone.trim());
    setDuplicateWarnings(phoneMatches);
  }

  // Debounced duplicate name check
  function handleNameChange(name: string) {
    setFormData(prev => ({ ...prev, name }));
    if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);

    if (name.trim().length < 2) {
      nameMatchedVendorsRef.current = [];
      setDuplicateWarnings([]);
      return;
    }

    nameSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await vendorsApi.search(name.trim());
        const matches = (res.data || []).filter(
          (v: Vendor) => !editingVendor || v.id !== editingVendor.id
        );
        nameMatchedVendorsRef.current = matches;
        filterDuplicates(matches, formData.phone);
      } catch {
        nameMatchedVendorsRef.current = [];
        setDuplicateWarnings([]);
      }
    }, 350);
  }

  // Re-filter duplicates when phone changes
  function handlePhoneChange(phone: string) {
    setFormData(prev => ({ ...prev, phone }));
    filterDuplicates(nameMatchedVendorsRef.current, phone);
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    if (sortDirection === 'asc') {
      return (
        <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // formatDate imported from @/lib/dateUtils

  const filteredVendors = vendors.filter((vendor) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      vendor.name?.toLowerCase().includes(searchLower) ||
      vendor.phone?.toLowerCase().includes(searchLower) ||
      vendor.address?.toLowerCase().includes(searchLower) ||
      vendor.gst_number?.toLowerCase().includes(searchLower) ||
      vendor.pan_number?.toLowerCase().includes(searchLower)
    );
  });

  const sortedVendors = [...filteredVendors].sort((a, b) => {
    if (!sortColumn) return 0;

    let aValue: any = a[sortColumn as keyof Vendor];
    let bValue: any = b[sortColumn as keyof Vendor];

    if (sortColumn === 'created_at' || sortColumn === 'updated_at') {
      aValue = aValue ? new Date(aValue).getTime() : 0;
      bValue = bValue ? new Date(bValue).getTime() : 0;
    } else {
      aValue = aValue?.toString().toLowerCase() || '';
      bValue = bValue?.toString().toLowerCase() || '';
    }

    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  if (loading) {
    return <div className="text-center py-12">Loading vendors...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">Vendor Management:</h1>
        <button className="px-4 py-2 border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors">
          Admin Panel
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm">
        {/* Controls */}
        <div className="p-6 pb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search vendors by name, phone, GST..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Total Vendors */}
            <div className="text-sm font-medium text-gray-700">
              Total Vendors: {filteredVendors.length}
            </div>
          </div>

          {/* Add Vendor Button */}
          <button
            onClick={() => {
              resetForm();
              setEditingVendor(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Add Vendor</span>
          </button>
        </div>

        {/* Table Container */}
        <div className="px-6 pb-6">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              {/* Table Header */}
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-1 px-0 py-3"></th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('id')}
                  >
                    ID
                    {getSortIcon('id')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    Name
                    {getSortIcon('name')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('phone')}
                  >
                    Phone
                    {getSortIcon('phone')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                    Address
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                    GST
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                    PAN
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                    Notes
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('created_at')}
                  >
                    Created
                    {getSortIcon('created_at')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Actions</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {sortedVendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {/* Status Indicator Bar */}
                    <td className="w-1 p-0">
                      <div className="w-full h-full min-h-[60px] bg-red-500"></div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 font-mono">#{vendor.id}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 font-medium">{vendor.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{vendor.phone}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 max-w-[200px] truncate" title={vendor.address || ''}>
                      {vendor.address || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 font-mono">{vendor.gst_number || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 font-mono">{vendor.pan_number || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 max-w-[200px] truncate" title={vendor.notes || ''}>
                      {vendor.notes || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(vendor.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEdit(vendor)}
                          className="text-red-600 hover:text-red-700 transition-colors"
                          title="Edit"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(vendor.id, vendor.name)}
                          className="text-red-600 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedVendors.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm ? 'No vendors match your search' : 'No vendors yet. Click "Add Vendor" to create one.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl my-8 mx-4">
            <h2 className="text-2xl font-bold mb-4">
              {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <Input
                    label="Vendor Name*"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    placeholder="ABC Traders"
                  />
                  {duplicateWarnings.length > 0 && (
                    <div className="mt-1 p-2 bg-amber-50 border border-amber-300 rounded-lg">
                      <p className="text-xs font-medium text-amber-800 mb-1">⚠ Similar vendor(s) already exist:</p>
                      {duplicateWarnings.map((v) => (
                        <p key={v.id} className="text-xs text-amber-700">
                          <span className="font-medium">{v.name}</span>
                          <span className="text-amber-500 ml-1">— {v.phone}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <PhoneInput
                  label="Phone"
                  value={formData.phone}
                  countryCode={formData.phone_country}
                  onValueChange={(v) => handlePhoneChange(v)}
                  onCountryCodeChange={(c) => { setFormData({ ...formData, phone_country: c, phone: '' }); filterDuplicates(nameMatchedVendorsRef.current, ''); }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                  placeholder="Enter vendor address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="GST Number"
                  value={formData.gst_number}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (val.length <= 15) {
                      setFormData({ ...formData, gst_number: val });
                      if (!val) {
                        setFormErrors((prev) => ({ ...prev, gst_number: undefined }));
                      } else if (!GST_REGEX.test(val)) {
                        setFormErrors((prev) => ({ ...prev, gst_number: 'Format: 22AAAAA0000A1Z5 (15 chars)' }));
                      } else {
                        setFormErrors((prev) => ({ ...prev, gst_number: undefined }));
                      }
                    }
                  }}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  error={formErrors.gst_number}
                />
                <Input
                  label="PAN Number"
                  value={formData.pan_number}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    if (val.length <= 10) {
                      setFormData({ ...formData, pan_number: val });
                      if (!val) {
                        setFormErrors((prev) => ({ ...prev, pan_number: undefined }));
                      } else if (!PAN_REGEX.test(val)) {
                        setFormErrors((prev) => ({ ...prev, pan_number: 'Format: ABCDE1234F (10 chars)' }));
                      } else {
                        setFormErrors((prev) => ({ ...prev, pan_number: undefined }));
                      }
                    }
                  }}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  error={formErrors.pan_number}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                  <span className="text-gray-400 font-normal ml-2">
                    ({formData.notes.length}/255)
                  </span>
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => {
                    if (e.target.value.length <= 255) {
                      setFormData({ ...formData, notes: e.target.value });
                    }
                  }}
                  rows={3}
                  maxLength={255}
                  placeholder="Any additional notes about this vendor..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <Button type="submit" className="flex-1">
                  {editingVendor ? 'Update Vendor' : 'Create Vendor'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingVendor(null);
                    resetForm();
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {ConfirmDialogComponent}
    </div>
  );
}
