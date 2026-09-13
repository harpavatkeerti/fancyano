'use client';

import { useEffect, useState } from 'react';
import { qrCodesApi } from '@/lib/api';

interface UpiQrConfirmModalProps {
  /** Amount to display in the header */
  amount: number;
  /** Controls which QR tab(s) to show: 'rent' = rent only, 'security' = security only, 'mixed' = both tabs */
  paymentCategory?: 'rent' | 'security' | 'mixed';
  /** Remaining non-security outstanding — shown as tab label in mixed mode */
  rentRemaining?: number;
  /** Remaining security outstanding — shown as tab label in mixed mode */
  securityRemaining?: number;
  /** Called with qr_code_id when user confirms payment received */
  onConfirm: (qrCodeId: number | null) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/**
 * UPI QR confirmation modal — shows the correct rent/security QR code
 * and lets the user confirm that payment was received.
 *
 * Used by PaymentManagement (normal payments) and ProductExchange (exchange payments).
 */
export function UpiQrConfirmModal({
  amount,
  paymentCategory = 'rent',
  rentRemaining,
  securityRemaining,
  onConfirm,
  onCancel,
}: UpiQrConfirmModalProps) {
  const [rentQr, setRentQr] = useState<{ id: number; qr_image: string } | null>(null);
  const [securityQr, setSecurityQr] = useState<{ id: number; qr_image: string } | null>(null);
  const [showSecurityTab, setShowSecurityTab] = useState(paymentCategory === 'security');
  const [loading, setLoading] = useState(true);

  // Fetch active QR codes on mount
  useEffect(() => {
    Promise.all([
      qrCodesApi.getActive('rent').then(res => res.data).catch(() => null),
      qrCodesApi.getActive('security').then(res => res.data).catch(() => null),
    ]).then(([rent, security]) => {
      setRentQr(rent ? { id: rent.id, qr_image: rent.qr_image } : null);
      setSecurityQr(security ? { id: security.id, qr_image: security.qr_image } : null);
      setLoading(false);
    });
  }, []);

  const noQrConfigured = !loading && !rentQr && !securityQr;

  // Tab visibility
  let showRentTab: boolean;
  let showSecTab: boolean;
  if (paymentCategory === 'rent') {
    showRentTab = !!rentQr;
    showSecTab = false;
  } else if (paymentCategory === 'security') {
    showRentTab = false;
    showSecTab = !!securityQr;
  } else {
    // mixed
    showRentTab = !!rentQr;
    showSecTab = !!securityQr;
  }

  const activeTab = showSecurityTab ? 'security' : 'rent';

  // Track active QR code ID based on current tab
  const activeQrId = activeTab === 'security' ? (securityQr?.id || null) : (rentQr?.id || null);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
        >
          ×
        </button>

        <h3 className="text-xl font-bold text-gray-900 mb-1 text-center">Collect via UPI</h3>
        {amount > 0 && (
          <p className="text-center text-gray-700 mb-4 text-lg">
            ₹{Math.floor(amount).toLocaleString('en-IN')}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center items-center min-h-[200px]">
            <p className="text-sm text-gray-500">Loading QR codes...</p>
          </div>
        ) : noQrConfigured ? (
          <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
            <p className="text-sm font-medium text-gray-600">No QR code configured</p>
            <p className="text-xs text-gray-500 mt-1">Ask admin to upload QR codes in Settings</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Tab buttons — only when both tabs are relevant (mixed) */}
            {showRentTab && showSecTab && (
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setShowSecurityTab(false)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${activeTab === 'rent' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  📋 Rent{rentRemaining ? ` (₹${Math.floor(rentRemaining).toLocaleString('en-IN')})` : ''}
                </button>
                <button
                  onClick={() => setShowSecurityTab(true)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${activeTab === 'security' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  🔒 Security{securityRemaining ? ` (₹${Math.floor(securityRemaining).toLocaleString('en-IN')})` : ''}
                </button>
              </div>
            )}

            {/* Rent QR */}
            {activeTab === 'rent' && showRentTab && rentQr && (
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                <h4 className="text-sm font-semibold text-blue-800 mb-1 text-center">📋 Rent Payment</h4>
                {rentRemaining !== undefined && rentRemaining > 0 && (
                  <p className="text-center text-blue-700 text-sm mb-3">Remaining: <span className="font-bold">₹{Math.floor(rentRemaining).toLocaleString('en-IN')}</span></p>
                )}
                <div className="flex justify-center">
                  <div className="bg-white rounded-lg border-2 border-blue-200 p-3">
                    <img src={rentQr.qr_image} alt="Rent QR" className="rounded-lg" style={{ maxWidth: '240px', maxHeight: '260px', width: 'auto', height: 'auto' }} />
                  </div>
                </div>
              </div>
            )}

            {/* Security QR */}
            {activeTab === 'security' && showSecTab && securityQr && (
              <div className="border border-green-200 rounded-lg p-4 bg-green-50/30">
                <h4 className="text-sm font-semibold text-green-800 mb-1 text-center">🔒 Security Deposit</h4>
                {securityRemaining !== undefined && securityRemaining > 0 && (
                  <p className="text-center text-green-700 text-sm mb-3">Remaining: <span className="font-bold">₹{Math.floor(securityRemaining).toLocaleString('en-IN')}</span></p>
                )}
                <div className="flex justify-center">
                  <div className="bg-white rounded-lg border-2 border-green-200 p-3">
                    <img src={securityQr.qr_image} alt="Security QR" className="rounded-lg" style={{ maxWidth: '240px', maxHeight: '260px', width: 'auto', height: 'auto' }} />
                  </div>
                </div>
              </div>
            )}

            {paymentCategory === 'mixed' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center">
                ⚠️ This payment covers both rent and security. Default QR is for rent — switch if customer is paying security separately.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(activeQrId)}
            disabled={noQrConfigured || loading}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-colors"
          >
            Payment Received ✓
          </button>
        </div>
      </div>
    </div>
  );
}
