'use client';

import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { User } from '@/types';
import { Button, Input } from '@/components/common';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function UsersPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    role: 'customer' as 'admin' | 'salesman' | 'customer',
    username: '',
    password: '',
    email: '',
    address: '',
  });
  const [showPassword, setShowPassword] = useState(false);

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
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, formData);
      } else {
        await usersApi.create(formData);
      }
      await fetchUsers();
      setShowAddModal(false);
      setEditingUser(null);
      resetForm();
      toast.success('User saved successfully');
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error('Error saving user');
    }
  }

  async function handleEdit(user: User) {
    try {
      // Fetch full user details including password
      const response = await usersApi.getById(user.id);
      const fullUser = response.data;
      
      setEditingUser(fullUser);
      setFormData({
        name: fullUser.name,
        phone: fullUser.phone,
        role: fullUser.role,
        username: fullUser.username || '',
        password: fullUser.password || '', // Show password if available
        email: fullUser.email || '',
        address: fullUser.address || '',
      });
      setShowPassword(false); // Reset password visibility
      setShowAddModal(true);
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Failed to load user details');
    }
  }

  async function handleDelete(id: number, userName: string) {
    const confirmed = await confirm({
      title: 'Delete User',
      message: `Are you sure you want to remove user "${userName}"? This action cannot be undone.`,
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
      await usersApi.delete(id);
      await fetchUsers();
      toast.success('User deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Error deleting user');
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      phone: '',
      role: 'customer',
      username: '',
      password: '',
      email: '',
      address: '',
    });
    setShowPassword(false);
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

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      const time = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${day}${getOrdinalSuffix(day)} ${month}, ${year}, ${time}`;
    } catch {
      return dateString;
    }
  };

  const getOrdinalSuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const filteredUsers = users.filter((user) => {
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

            {/* Filters Button */}
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Filters
            </button>
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
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Full Name*"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="John Doe"
                />
                <Input
                  label="Username*"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  placeholder="johndoe (auto-generated if empty)"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Phone Number*"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  placeholder="+91 1234567890"
                />
                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingUser ? "Password (leave empty to keep current)" : "Password*"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role*</label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: formData.role === 'admin' ? '#9333ea' : '#d1d5db' }}>
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={formData.role === 'admin'}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="mr-2"
                    />
                    <span className="font-medium">Admin</span>
                  </label>
                  <label className="flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: formData.role === 'salesman' ? '#3b82f6' : '#d1d5db' }}>
                    <input
                      type="radio"
                      name="role"
                      value="salesman"
                      checked={formData.role === 'salesman'}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="mr-2"
                    />
                    <span className="font-medium">Salesman</span>
                  </label>
                  <label className="flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    style={{ borderColor: formData.role === 'customer' ? '#6b7280' : '#d1d5db' }}>
                    <input
                      type="radio"
                      name="role"
                      value="customer"
                      checked={formData.role === 'customer'}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="mr-2"
                    />
                    <span className="font-medium">Customer</span>
                  </label>
                </div>
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
