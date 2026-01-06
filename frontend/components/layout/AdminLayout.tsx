'use client';

import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ToastContainer } from '@/components/common';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempUsername, setTempUsername] = useState(''); // Placeholder for future use
  
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
  
  function handleLogin() {
    if (!tempName || tempName.trim() === '') {
      alert('Please enter your name');
      return;
    }
    
    const name = tempName.trim();
    const username = tempUsername.trim() || name.toLowerCase().replace(/\s+/g, '');
    
    // Store admin data
    localStorage.setItem('admin_name', name);
    localStorage.setItem('admin_username', username);
    localStorage.setItem('admin_user', JSON.stringify({ 
      name, 
      userName: name,
      username: username,
      // password field will be added later
      role: 'admin'
    }));
    
    setAdminName(name);
    setShowLoginModal(false);
    
    console.log('✅ Admin logged in:', name);
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
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter username (auto-generated if empty)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              
              {/* Placeholder for password field - will be added later */}
              {/* 
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-600">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              */}
            </div>
            
            <button
              onClick={handleLogin}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium mt-6"
            >
              Login to Admin Portal
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

