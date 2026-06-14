'use client';

import Sidebar from './Sidebar';
import Header from './Header';
import { ToastContainer } from '@/components/common';
import { useAuth } from '@/lib/authContext';

/**
 * AppLayout — role-agnostic shell.
 *
 * - Renders the top Header bar for ALL roles.
 * - Renders the left Sidebar ONLY for admin (Sidebar self-guards via useAuth).
 * - No login modal, no localStorage auth checking — all handled by AuthProvider
 *   in the root layout and (authenticated)/layout.tsx.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex flex-1">
        {/* Left sidebar — admin only (Sidebar component already self-guards) */}
        {isAdmin && <Sidebar />}
        <main className={`flex-1 p-6 ${isAdmin ? 'ml-64' : ''}`}>
          {children}
        </main>
      </div>
      <ToastContainer>
        <div />
      </ToastContainer>
    </div>
  );
}
