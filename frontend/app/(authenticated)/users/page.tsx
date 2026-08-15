'use client';

import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { User } from '@/types';
import { Button, Input, PhoneInput } from '@/components/common';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';
import { isValidPhoneNumber, getCountryByCode } from '@/lib/countryCodes';
import { formatDateWithOrdinal as formatDate } from '@/lib/dateUtils';

export default function UsersPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(['admin', 'salesman', 'customer']));
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phone_country: 'IN',
    alternate_phone: '',
    alternate_phone_country: 'IN',
    role: 'customer' as 'admin' | 'salesman' | 'customer',
    email: '',
    address: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate primary phone (create only — locked on edit)
    if (!editingUser) {
      if (!formData.phone) {
        toast.warning('Mobile number is required');
        return;
      }
      if (!isValidPhoneNumber(formData.phone, formData.phone_country)) {
        toast.warning('Please enter a valid mobile number');
        return;
      }
    }
    // Validate alternate phone
    if (!formData.alternate_phone) {
      toast.warning('Alternate mobile number is required');
      return;
    }
    if (!isValidPhoneNumber(formData.alternate_phone, formData.alternate_phone_country)) {
      toast.warning('Please enter a valid alternate mobile number');
      return;
    }
    // Check both are not the same
    const c1 = getCountryByCode(formData.phone_country);
    const c2 = getCountryByCode(formData.alternate_phone_country);
    const full1 = `${c1?.callingCode}${formData.phone}`;
    const full2 = `${c2?.callingCode}${formData.alternate_phone}`;
    if (full1 === full2) {
      toast.warning('Mobile number and alternate mobile number cannot be the same');
      return;
    }
    try {
      if (editingUser) {
        // phone and phone_country are immutable — omit them from update
        await usersApi.update(editingUser.id, {
          name: formData.name,
          alternate_phone: formData.alternate_phone,
          alternate_phone_country: formData.alternate_phone_country,
          role: formData.role,
          email: formData.email,
          address: formData.address,
        });
      } else {
        await usersApi.create({
          name: formData.name,
          phone: formData.phone,
          phone_country: formData.phone_country,
          alternate_phone: formData.alternate_phone,
          alternate_phone_country: formData.alternate_phone_country,
          role: formData.role,
          email: formData.email,
          address: formData.address,
        });
      }
      await fetchUsers();
      setShowAddModal(false);
      setEditingUser(null);
      resetForm();
      toast.success(editingUser ? 'User updated successfully' : 'User created successfully');
    } catch (error: any) {
      const msg = error?.response?.data?.error || (editingUser ? 'Error updating user' : 'Error creating user');
      toast.error(msg);
    }
  }

  async function handleEdit(user: User) {
    try {
      const response = await usersApi.getById(user.id);
      const fullUser = response.data;
      setEditingUser(fullUser);
      setFormData({
        name: fullUser.name,
        phone: fullUser.phone,
        phone_country: fullUser.phone_country,
        alternate_phone: fullUser.alternate_phone,
        alternate_phone_country: fullUser.alternate_phone_country,
        role: fullUser.role as 'admin' | 'salesman' | 'customer',
        email: fullUser.email || '',
        address: fullUser.address || '',
      });
      setShowAddModal(true);
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Failed to load user details');
    }
  }

  async function handleDelete(id: number, userName: string) {
    const confirmed = await confirm({
      title: 'Deactivate Customer',
      message: `Are you sure you want to deactivate "${userName}"? They will no longer appear in search, but their booking history is preserved.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) return;

    try {
      await usersApi.delete(id);
      await fetchUsers();
      toast.success('Customer deactivated successfully');
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Error deactivating customer';
      toast.error(msg);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      phone: '',
      phone_country: 'IN',
      alternate_phone: '',
      alternate_phone_country: 'IN',
      role: 'customer',
      email: '',
      address: '',
    });
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

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const filteredUsers = users.filter((user) => {
    if (!selectedRoles.has(user.role?.toLowerCase() || '')) return false;
    const searchLower = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchLower) ||
      user.phone?.toLowerCase().includes(searchLower) ||
      user.role?.toLowerCase().includes(searchLower) ||
      user.username?.toLowerCase().includes(searchLower)
    );
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!sortColumn) return 0;
    
    let aValue: any = a[sortColumn as keyof User];
    let bValue: any = b[sortColumn as keyof User];
    
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
    return <div className="text-center py-12">Loading users...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">User Management:</h1>
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
                placeholder="Search"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Total Users */}
            <div className="text-sm font-medium text-gray-700">
              Total User: {filteredUsers.length}
            </div>

            {/* Role Filter Buttons */}
            <div className="flex items-center gap-2">
              {(['admin', 'salesman', 'customer'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${
                    selectedRoles.has(role)
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                      : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Add User Button */}
          <button
            onClick={() => {
              resetForm();
              setEditingUser(null);
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
            <span>Add User</span>
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
                    onClick={() => handleSort('name')}
                  >
                    User Name
                    {getSortIcon('name')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('role')}
                  >
                    Role
                    {getSortIcon('role')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('phone')}
                  >
                    Phone Number
                    {getSortIcon('phone')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('created_at')}
                  >
                    Created on
                    {getSortIcon('created_at')}
                  </th>
                  <th
                    className="px-4 py-3 text-left text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-200 transition-colors"
                    onClick={() => handleSort('updated_at')}
                  >
                    Last Login
                    {getSortIcon('updated_at')}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-bold text-gray-700">Actions</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {/* Status Indicator Bar */}
                    <td className="w-1 p-0">
                      <div className="w-full h-full min-h-[60px] bg-red-500"></div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{user.name || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-900 capitalize">{user.role || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{user.phone || '-'}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(user.updated_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEdit(user)}
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
                          onClick={() => handleDelete(user.id, user.name)}
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
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No users found
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
              {editingUser ? 'Edit User' : 'Add New User'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Full Name*"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="John Doe"
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <PhoneInput
                    label="Mobile Number*"
                    value={formData.phone}
                    countryCode={formData.phone_country}
                    onValueChange={(value) => setFormData({ ...formData, phone: value })}
                    onCountryCodeChange={(code) => setFormData({ ...formData, phone_country: code, phone: '' })}
                    required
                    disabled={!!editingUser}
                  />
                  {editingUser && (
                    <p className="text-xs text-gray-400 mt-1">Phone number cannot be changed after creation.</p>
                  )}
                </div>
                <PhoneInput
                  label="Alternate Mobile Number*"
                  value={formData.alternate_phone}
                  countryCode={formData.alternate_phone_country}
                  onValueChange={(value) => setFormData({ ...formData, alternate_phone: value })}
                  onCountryCodeChange={(code) => setFormData({ ...formData, alternate_phone_country: code, alternate_phone: '' })}
                  required
                />
              </div>

              {/* Role — shown for both create and edit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role*</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'salesman' | 'customer' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="customer">Customer</option>
                  <option value="salesman">Salesman</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Username and password are auto-assigned based on phone number.</p>
              </div>

              <Input
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="customer@example.com"
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  placeholder="Enter full address"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <Button type="submit" className="flex-1">
                  {editingUser ? 'Update User' : 'Create User'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingUser(null);
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
