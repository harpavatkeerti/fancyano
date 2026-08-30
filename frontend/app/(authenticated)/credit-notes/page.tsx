'use client';

import { useEffect, useState } from 'react';
import { creditNotesApi, CreditNote } from '@/lib/api';
import { Button, Input } from '@/components/common';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { useConfirm } from '@/hooks/useConfirm';

export default function CreditNotesPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'partially_used' | 'fully_used' | 'expired'>('all');

  useEffect(() => {
    fetchCreditNotes();
  }, []);

  async function fetchCreditNotes() {
    try {
      setLoading(true);
      const response = await creditNotesApi.getAll();
      setCreditNotes(response.data);
    } catch (error) {
      console.error('Error fetching credit notes:', error);
      addAlert('Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number, customerName: string) {
    const confirmed = await confirm({
      title: 'Delete Credit Note',
      message: `Are you sure you want to delete the credit note for "${customerName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) {
      return;
    }

    try {
      await creditNotesApi.delete(id);
      await fetchCreditNotes();
      toast.success('Credit note deleted successfully');
    } catch (error) {
      console.error('Error deleting credit note:', error);
      addAlert('Error deleting credit note');
    }
  }

  function formatDate(dateString: string) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string }> = {
      active: { label: 'Active', color: 'bg-green-100 text-green-800' },
      partially_used: { label: 'Partially Used', color: 'bg-yellow-100 text-yellow-800' },
      fully_used: { label: 'Fully Used', color: 'bg-gray-100 text-gray-800' },
      expired: { label: 'Expired', color: 'bg-red-100 text-red-800' },
    };

    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  }

  function isExpired(validUntil: string) {
    if (!validUntil) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(validUntil);
    expiryDate.setHours(0, 0, 0, 0);
    return expiryDate < today;
  }

  // Filter credit notes
  const filteredCreditNotes = creditNotes.filter((note) => {
    const matchesSearch = 
      note.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.customer_phone && note.customer_phone.includes(searchTerm)) ||
      (note.booking_id && note.booking_id.toString().includes(searchTerm));
    
    const matchesStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'expired'
      ? isExpired(note.valid_until)
      : note.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const stats = {
    total: creditNotes.length,
    active: creditNotes.filter(n => n.status === 'active' && !isExpired(n.valid_until)).length,
    totalAmount: creditNotes.reduce((sum, note) => sum + parseFloat(note.amount.toString()), 0),
    usedAmount: creditNotes.reduce((sum, note) => sum + parseFloat(note.used_amount?.toString() || '0'), 0),
    availableAmount: creditNotes.reduce((sum, note) => {
      const amount = parseFloat(note.amount.toString());
      const used = parseFloat(note.used_amount?.toString() || '0');
      return sum + (amount - used);
    }, 0),
  };

  if (loading) {
    return <div className="text-center py-12">Loading credit notes...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Inline alert banner for page-level errors */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} />
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Credit Notes</h1>
        <Button onClick={fetchCreditNotes}>
          🔄 Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Credit Notes</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-green-600 mt-2">{stats.active}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Amount</div>
          <div className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(stats.totalAmount)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Available Amount</div>
          <div className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(stats.availableAmount)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by customer name, phone, or booking ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="partially_used">Partially Used</option>
              <option value="fully_used">Fully Used</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Credit Notes Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Used
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valid Until
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCreditNotes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                    No credit notes found
                  </td>
                </tr>
              ) : (
                filteredCreditNotes.map((note) => {
                  const amount = parseFloat(note.amount.toString());
                  const used = parseFloat(note.used_amount?.toString() || '0');
                  const available = amount - used;
                  const expired = isExpired(note.valid_until);
                  const displayStatus = expired ? 'expired' : note.status;

                  return (
                    <tr key={note.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{note.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{note.customer_name}</div>
                        {note.customer_phone && (
                          <div className="text-sm text-gray-500">{note.customer_phone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {note.booking_id ? `#${note.booking_id}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(used)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        {formatCurrency(available)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(note.valid_until)}
                        {expired && (
                          <span className="ml-2 text-xs text-red-600">(Expired)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(displayStatus)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {note.issued_by || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(note.issued_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleDelete(note.id, note.customer_name)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ConfirmDialogComponent}
    </div>
  );
}

