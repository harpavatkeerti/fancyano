'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ToastContainer } from '@/components/common';
import { authApi } from '@/lib/authApi';
import { toast } from '@/lib/toast';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    checkAdminLogin();
  }, []);
  
  // Check if admin is logged in
  function checkAdminLogin() {
    const userData = localStorage.getItem('admin_user');
    let storedName = '';
    
    if (userData) {
      try {
        const user = JSON.parse(userData);
        storedName = user.name || user.userName || '';
        // Check if user is actually an admin
        if (user.role !== 'admin') {
          // Not an admin, clear and show login
          localStorage.removeItem('admin_user');
          localStorage.removeItem('admin_name');
          localStorage.removeItem('admin_username');
          setShowLoginModal(true);
          return;
        }
      } catch (e) {
        storedName = localStorage.getItem('admin_name') || '';
      }
    } else {
      storedName = localStorage.getItem('admin_name') || '';
    }
    
    if (!storedName || storedName.trim() === '' || storedName === 'Admin') {
      setShowLoginModal(true);
    } else {
      setAdminName(storedName);
    }
  }
  
  async function handleLogin() {
    if (!tempName || tempName.trim() === '') {
      toast.error('Please enter your name');
      return;
    }
    
    try {
      setLoading(true);
      const name = tempName.trim();
      const username = tempUsername.trim() || name.toLowerCase().replace(/\s+/g, '');
      
      // Authenticate with backend (password is optional if user doesn't have one set)
      const response = await authApi.login({
        name: name,
        username: username || undefined,
        password: tempPassword || '', // Allow empty password for users without password set
        role: 'admin'
      });
      
      const user = response.data.user;
      
      // Verify role is admin
      if (user.role !== 'admin') {
        toast.error('Access denied. Admin role required.');
        return;
      }
      
      // Store admin data
      localStorage.setItem('admin_name', user.name);
      localStorage.setItem('admin_username', user.username || username);
      localStorage.setItem('admin_user', JSON.stringify({ 
        id: user.id,
        name: user.name, 
        userName: user.name,
        username: user.username || username,
        role: 'admin'
      }));
      
      setAdminName(user.name);
      setShowLoginModal(false);
      setTempName('');
      setTempUsername('');
      setTempPassword('');
      
      toast.success('Login successful');
      console.log('✅ Admin logged in:', user.name);
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.error || 'Invalid credentials. Please check your name and password.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }
  
  // Expose logout function to Header component via window
  useEffect(() => {
    (window as any).adminLogout = () => {
      if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('admin_name');
        localStorage.removeItem('admin_username');
        localStorage.removeItem('admin_user');
        window.location.reload();
      }
    };
    
    return () => {
      delete (window as any).adminLogout;
    };
  }, []);
  
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar role="admin" />
      <div className="flex-1 ml-64">
        <Header />
        <main className="p-6">{children}</main>
      </div>
      
      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="inline-block bg-red-600 text-white px-4 py-2 font-bold text-xl mb-4">
                FAN-C-YA-NO
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Portal</h2>
              <p className="text-gray-600">Please enter your credentials to continue</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleLogin()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username (Optional)
                </label>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleLogin()}
                  placeholder="Enter username (auto-generated if empty)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {tempPassword ? <span className="text-red-600">*</span> : <span className="text-gray-500">(Optional)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleLogin()}
                    placeholder="Enter your password"
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
            </div>
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login to Admin Portal'}
            </button>
            
            <p className="text-sm text-gray-500 mt-4 text-center">
              Authorized personnel only
            </p>
          </div>
        </div>
      )}
      
      <ToastContainer>
        <div />
      </ToastContainer>
    </div>
  );
}

