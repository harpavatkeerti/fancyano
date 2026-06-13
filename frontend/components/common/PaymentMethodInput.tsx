'use client';

import { useEffect, useState } from 'react';
import { settingsApi } from '@/lib/api';
import { QRScanner } from '@/components/common';
import { toast } from '@/lib/toast';

interface PaymentMethodInputProps {
  method: string;
  onMethodChange: (method: string) => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  amount?: number;              // shown in QR modal header "Amount to collect: ₹X"
  notesPlaceholder?: string;    // default: "Enter transaction details, UPI ID, reference number, etc."
  notesLabel?: string;          // default: "Notes (Optional)"
  rentRemaining?: number;       // for QR tab label — if provided, shows remaining amount
  securityRemaining?: number;   // for QR tab label — if provided, shows remaining amount
  colorScheme?: 'blue' | 'green' | 'red' | 'orange';
  showQR?: boolean;              // default true — set false for refund contexts where QR isn't relevant
  className?: string;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

const FOCUS_COLORS: Record<string, string> = {
  blue: 'focus:ring-blue-500',
  green: 'focus:ring-green-500',
  red: 'focus:ring-red-500',
  orange: 'focus:ring-orange-500',
};

export function PaymentMethodInput({
  method,
  onMethodChange,
  notes,
  onNotesChange,
  amount,
  notesPlaceholder = 'Enter transaction details, UPI ID, reference number, etc.',
  notesLabel = 'Notes (Optional)',
  rentRemaining,
  securityRemaining,
  colorScheme = 'blue',
  showQR = true,
  className = '',
}: PaymentMethodInputProps) {
  const [showUPIModal, setShowUPIModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showSecurityQr, setShowSecurityQr] = useState(false);
  const [paymentScanned, setPaymentScanned] = useState(false);
  const [rentQrCode, setRentQrCode] = useState('');
  const [securityQrCode, setSecurityQrCode] = useState('');

  // Fetch QR codes from settings on mount (only when showing QR)
  useEffect(() => {
    if (!showQR) return;
    settingsApi.getByKey('payment_qr_rent')
      .then(res => { if (res.data?.setting_value) setRentQrCode(res.data.setting_value); })
      .catch(() => {});
    settingsApi.getByKey('payment_qr_security')
      .then(res => { if (res.data?.setting_value) setSecurityQrCode(res.data.setting_value); })
      .catch(() => {});
  }, [showQR]);

  const focusRing = FOCUS_COLORS[colorScheme] || FOCUS_COLORS.blue;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Payment Method Dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Payment Method <span className="text-red-500">*</span>
        </label>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value)}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${focusRing} bg-white`}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* UPI QR Button — shown when UPI is selected and showQR is true */}
      {method === 'UPI' && showQR && (
        <div>
          <button
            onClick={() => setShowUPIModal(true)}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Show UPI QR Code
          </button>
          {paymentScanned && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 text-center">
                ✅ Payment QR scanned successfully!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Transaction Notes — only rendered when notes/onNotesChange are provided */}
      {onNotesChange && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {notesLabel}
          </label>
          <textarea
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={notesPlaceholder}
            rows={3}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${focusRing} resize-none`}
          />
          <p className="text-xs text-gray-500 mt-1">
            💡 Add any additional details about this transaction
          </p>
        </div>
      )}

      {/* UPI QR Modal */}
      {showUPIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
            <button
              onClick={() => {
                setShowUPIModal(false);
                setPaymentScanned(false);
              }}
              className="absolute top-4 right-4 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              ×
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">Pay using UPI</h3>
            {amount !== undefined && amount > 0 && (
              <p className="text-center text-gray-700 mb-4">
                Amount to collect: ₹{Math.floor(amount).toLocaleString('en-IN')}
              </p>
            )}

            {/* QR Content */}
            {(() => {
              const noQrConfigured = !rentQrCode && !securityQrCode;
              const showRentTab = (rentRemaining === undefined || rentRemaining > 0) && !!rentQrCode;
              const showSecurityTab = (securityRemaining === undefined || securityRemaining > 0) && !!securityQrCode;
              const activeTab = showSecurityQr ? 'security' : 'rent';

              if (noQrConfigured) return (
                <div className="flex justify-center mb-4">
                  <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
                    <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <p className="text-sm font-medium text-gray-600">No QR code configured</p>
                    <p className="text-xs text-gray-500 mt-1">Ask admin to upload QR codes in Settings</p>
                  </div>
                </div>
              );

              return (
                <div className="space-y-3">
                  {/* Tab buttons — only if both QRs exist and both are relevant */}
                  {showRentTab && showSecurityTab && (
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                      <button
                        onClick={() => setShowSecurityQr(false)}
                        className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${activeTab === 'rent' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                      >
                        📋 Rent{rentRemaining !== undefined ? ` (₹${Math.floor(rentRemaining).toLocaleString('en-IN')})` : ''}
                      </button>
                      <button
                        onClick={() => setShowSecurityQr(true)}
                        className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${activeTab === 'security' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                      >
                        🔒 Security{securityRemaining !== undefined ? ` (₹${Math.floor(securityRemaining).toLocaleString('en-IN')})` : ''}
                      </button>
                    </div>
                  )}
                  {/* Rent QR */}
                  {activeTab === 'rent' && showRentTab && (
                    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
                      <h4 className="text-sm font-semibold text-blue-800 mb-1 text-center">📋 Rent Payment</h4>
                      {rentRemaining !== undefined && (
                        <p className="text-center text-blue-700 text-sm mb-3">Remaining: <span className="font-bold">₹{Math.floor(rentRemaining).toLocaleString('en-IN')}</span></p>
                      )}
                      <div className="flex justify-center">
                        <div className="bg-white rounded-lg border-2 border-blue-200 p-3">
                          <img src={rentQrCode} alt="Rent QR" className="rounded-lg" style={{ maxWidth: '240px', maxHeight: '260px', width: 'auto', height: 'auto' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Security QR */}
                  {activeTab === 'security' && showSecurityTab && (
                    <div className="border border-green-200 rounded-lg p-4 bg-green-50/30">
                      <h4 className="text-sm font-semibold text-green-800 mb-1 text-center">🔒 Security Deposit</h4>
                      {securityRemaining !== undefined && (
                        <p className="text-center text-green-700 text-sm mb-3">Remaining: <span className="font-bold">₹{Math.floor(securityRemaining).toLocaleString('en-IN')}</span></p>
                      )}
                      <div className="flex justify-center">
                        <div className="bg-white rounded-lg border-2 border-green-200 p-3">
                          <img src={securityQrCode} alt="Security QR" className="rounded-lg" style={{ maxWidth: '240px', maxHeight: '260px', width: 'auto', height: 'auto' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {/* If only one QR and it doesn't match active tab, show it anyway */}
                  {!showRentTab && !showSecurityTab && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <p className="text-sm font-medium text-green-700">✅ All payments are fully collected!</p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-3 mt-4">
              <button
                onClick={() => {
                  setShowQRScanner(true);
                  setShowUPIModal(false);
                }}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Scan Payment QR
              </button>
              <button
                onClick={() => setShowUPIModal(false)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          title="📷 Scan Payment QR Code"
          onScan={(code: string) => {
            console.log('Payment QR scanned:', code);
            setPaymentScanned(true);
            setShowQRScanner(false);
            setShowUPIModal(true);
            toast.success('Payment QR scanned successfully!');
          }}
          onClose={() => {
            setShowQRScanner(false);
            setShowUPIModal(true);
          }}
        />
      )}
    </div>
  );
}
