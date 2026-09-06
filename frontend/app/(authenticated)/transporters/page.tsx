'use client';

import { useEffect, useState, useRef } from 'react';
import { transportersApi, Transporter } from '@/lib/api';
import { Input } from '@/components/common';
import PhoneInput from '@/components/common/PhoneInput';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDateWithOrdinal as formatDate } from '@/lib/dateUtils';

export default function TransportersPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const { alerts, addAlert, removeAlert } = useAlerts();
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransporter, setEditingTransporter] = useState<Transporter | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone_country: 'IN',
    bus_no: '',
    notes: '',
  });
  const [duplicateWarnings, setDuplicateWarnings] = useState<Transporter[]>([]);
  const nameMatchedRef = useRef<Transporter[]>([]);
  const nameSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTransporters();
  }, []);

  async function fetchTransporters() {
    try {
      const response = await transportersApi.getAll();
      setTransporters(response.data);
    } catch (error) {
      console.error('Error fetching transporters:', error);
      addAlert('Failed to load transporters');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      addAlert('Transporter name is required', 'warning');
      return;
    }
    if (!formData.phone.trim()) {
      addAlert('Phone number is required', 'warning');
      return;
    }
    if (formData.notes.length > 255) {
      addAlert('Notes must be 255 characters or fewer', 'warning');
      return;
    }

    try {
      if (editingTransporter) {
        await transportersApi.update(editingTransporter.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          phone_country: formData.phone_country,
          bus_no: formData.bus_no.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        });
        toast.success('Transporter updated successfully');
      } else {
        await transportersApi.create({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          phone_country: formData.phone_country,
          bus_no: formData.bus_no.trim() || undefined,
          notes: formData.notes.trim() || undefined,
        } as any);
        toast.success('Transporter created successfully');
      }
      await fetchTransporters();
      setShowAddModal(false);
      setEditingTransporter(null);
      resetForm();
    } catch (error: any) {
      const msg = error?.response?.data?.error || (editingTransporter ? 'Error updating transporter' : 'Error creating transporter');
      addAlert(msg);
    }
  }

  async function handleEdit(transporter: Transporter) {
    setEditingTransporter(transporter);
    setFormData({
      name: transporter.name || '',
      phone: transporter.phone || '',
      phone_country: transporter.phone_country || 'IN',
      bus_no: transporter.bus_no || '',
      notes: transporter.notes || '',
    });
    setDuplicateWarnings([]);
    setShowAddModal(true);
  }

  async function handleDelete(id: number, name: string) {
    const confirmed = await confirm({
      title: 'Delete Transporter',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) return;

    try {
      await transportersApi.delete(id);
      await fetchTransporters();
      toast.success('Transporter deleted successfully');
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Error deleting transporter';
      addAlert(msg);
    }
  }

  function resetForm() {
    setFormData({ name: '', phone: '', phone_country: 'IN', bus_no: '', notes: '' });
    setDuplicateWarnings([]);
    nameMatchedRef.current = [];
    if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);
  }

  // Debounced duplicate name check
  function handleNameChange(name: string) {
    setFormData(prev => ({ ...prev, name }));
    if (nameSearchTimerRef.current) clearTimeout(nameSearchTimerRef.current);

    if (name.trim().length < 2) {
      nameMatchedRef.current = [];
      setDuplicateWarnings([]);
      return;
    }

    nameSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await transportersApi.search(name.trim());
        const matches = (res.data || []).filter(
          (t: Transporter) => !editingTransporter || t.id !== editingTransporter.id
        );
        nameMatchedRef.current = matches;
        // Filter by phone
        if (!formData.phone.trim()) {
          setDuplicateWarnings(matches);
        } else {
          setDuplicateWarnings(matches.filter(t => t.phone === formData.phone.trim()));
        }
      } catch {
        nameMatchedRef.current = [];
        setDuplicateWarnings([]);
      }
    }, 350);
  }

  function handlePhoneChange(phone: string) {
    setFormData(prev => ({ ...prev, phone }));
    if (!phone.trim()) {
      setDuplicateWarnings(nameMatchedRef.current);
    } else {
      setDuplicateWarnings(nameMatchedRef.current.filter(t => t.phone === phone.trim()));
    }
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

  const filteredTransporters = transporters.filter((t) => {
    const s = searchTerm.toLowerCase();
    return (
      t.name?.toLowerCase().includes(s) ||
      t.phone?.toLowerCase().includes(s) ||
      t.bus_no?.toLowerCase().includes(s) ||
      t.notes?.toLowerCase().includes(s)
    );
  });

  const sortedTransporters = [...filteredTransporters].sort((a, b) => {
    if (!sortColumn) return 0;
    let aVal: any = a[sortColumn as keyof Transporter];
    let bVal: any = b[sortColumn as keyof Transporter];

    if (sortColumn === 'created_at' || sortColumn === 'updated_at') {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    } else {
      aVal = aVal?.toString().toLowerCase() || '';
      bVal = bVal?.toString().toLowerCase() || '';
    }

    return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  if (loading) {
    return <div className="text-center py-12">Loading transporters...</div>;
  }

  return (
    <div className="space-y-6">
      <AlertBanner alerts={alerts} onDismiss={removeAlert} />

      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">Transporters</h1>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm">
        {/* Controls */}
        <div className="p-6 pb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, phone, bus no..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Total Count */}
            <div className="text-sm font-medium text-gray-700">
              Total Transporters: {filteredTransporters.length}
            </div>
          </div>

          {/* Add Button */}
          <button
            onClick={() => {
              resetForm();
              setEditingTransporter(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Transporter</span>
          </button>
        </div>

        {/* Table */}
        <div className="px-6 pb-6">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-1 px-0 py-3"></th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('id')}>
                    ID{getSortIcon('id')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('name')}>
                    Name{getSortIcon('name')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('phone')}>
                    Phone{getSortIcon('phone')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('bus_no')}>
                    Bus No{getSortIcon('bus_no')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">
                    Notes
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('created_at')}>
                    Created{getSortIcon('created_at')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTransporters.map((t) => (
                  <tr key={t.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="w-1 p-0">
                      <div className="w-full h-full min-h-[60px] bg-red-500"></div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 font-mono">#{t.id}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 font-medium">{t.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{t.phone}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 font-mono">{t.bus_no || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 max-w-[200px] truncate" title={t.notes || ''}>
                      {t.notes || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleEdit(t)} className="text-red-600 hover:text-red-700 transition-colors" title="Edit">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(t.id, t.name)} className="text-red-600 hover:text-red-700 transition-colors" title="Delete">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedTransporters.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm ? 'No transporters match your search' : 'No transporters yet. Click "Add Transporter" to create one.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl my-8 mx-4">
            <h2 className="text-2xl font-bold mb-4">
              {editingTransporter ? 'Edit Transporter' : 'Add New Transporter'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <Input
                    label="Transporter Name*"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    placeholder="Rajdhani Transport"
                  />
                  {duplicateWarnings.length > 0 && (
                    <div className="mt-1 p-2 bg-amber-50 border border-amber-300 rounded-lg">
                      <p className="text-xs font-medium text-amber-800 mb-1">⚠ Similar transporter(s) already exist:</p>
                      {duplicateWarnings.map((t) => (
                        <p key={t.id} className="text-xs text-amber-700">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-amber-500 ml-1">— {t.phone}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <PhoneInput
                  label="Phone*"
                  value={formData.phone}
                  countryCode={formData.phone_country}
                  onValueChange={(v) => handlePhoneChange(v)}
                  onCountryCodeChange={(c) => { setFormData({ ...formData, phone_country: c, phone: '' }); setDuplicateWarnings(nameMatchedRef.current); }}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Bus / Vehicle No"
                  value={formData.bus_no}
                  onChange={(e) => setFormData({ ...formData, bus_no: e.target.value })}
                  placeholder="GJ05AB1234"
                />
                <Input
                  label="Notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingTransporter(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  {editingTransporter ? 'Update Transporter' : 'Add Transporter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmDialogComponent}
    </div>
  );
}
