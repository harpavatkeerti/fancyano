'use client';

import { useState, useEffect } from 'react';

export default function Header() {
  const [user, setUser] = useState<{ name: string; username?: string; role: string } | null>(null);
  
  useEffect(() => {
    loadUser();
  }, []);
  
  function loadUser() {
    const userData = localStorage.getItem('admin_user');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUser({
          name: parsed.name || 'Admin',
          username: parsed.username || parsed.userName || '',
          role: parsed.role || 'admin'
        });
      } catch (e) {
        const name = localStorage.getItem('admin_name') || 'Admin';
        setUser({ name, role: 'admin' });
      }
    } else {
      const name = localStorage.getItem('admin_name') || 'Admin';
      setUser({ name, role: 'admin' });
    }
  }
  
  function handleLogout() {
    // Use the logout function from AdminLayout if available
    if ((window as any).adminLogout) {
      (window as any).adminLogout();
    } else {
      // Fallback
      if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('admin_name');
        localStorage.removeItem('admin_username');
        localStorage.removeItem('admin_user');
        window.location.reload();
      }
    }
  }
  
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-6 py-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Admin Panel</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">
              {user?.name || 'Admin'}
              {user?.username && <span className="text-gray-500 ml-2">(@{user.username})</span>}
            </p>
            <p className="text-xs text-gray-500 capitalize">{user?.role || 'Admin'}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold">
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1 rounded border border-red-600 hover:bg-red-50 transition-colors"
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

