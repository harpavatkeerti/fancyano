'use client';

import { useEffect, useRef, useState } from 'react';

interface QRScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  title?: string;
}

export default function QRScanner({ onScan, onClose, title = '📷 Scan Product QR Code' }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Dynamically import html5-qrcode only on client side
    let isMounted = true;

    const loadScanner = async () => {
      try {
        const { Html5QrcodeScanner, Html5QrcodeScanType } = await import('html5-qrcode');
        
        if (!isMounted) return;

        const scanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
            rememberLastUsedCamera: true,
          },
          false
        );

        scanner.render(
          (decodedText: string) => {
            setIsScanning(false);
            scanner.clear();
            onScan(decodedText);
          },
          (error: any) => {
            // Silent error handling - don't log scan failures
          }
        );

        scannerRef.current = scanner;
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading QR scanner:', error);
        setIsLoading(false);
      }
    };

    loadScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.clear().catch((err: any) => {
          console.error('Error clearing scanner:', err);
        });
      }
    };
  }, [onScan]);

  const handleClose = () => {
    if (scannerRef.current && isScanning) {
      scannerRef.current.clear().catch((err) => {
        console.error('Error clearing scanner:', err);
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          {isLoading ? (
            <div className="w-full h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-sm text-gray-700">Loading scanner...</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-700 text-center mb-2">
                Position the QR code within the camera frame
              </p>
              <div id="qr-reader" className="w-full"></div>
            </>
          )}
        </div>

        <div className="flex justify-between items-center text-sm text-gray-600">
          <p>💡 Tip: Ensure good lighting for better scanning</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

