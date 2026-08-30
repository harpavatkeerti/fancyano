'use client';

import { useState } from 'react';
import { invoicesApi, SERVER_BASE_URL } from '@/lib/api';
import { makeShareableUrl } from '@/lib/urlHelper';
import { formatPhoneForWhatsApp } from '@/lib/phoneHelper';
import { toast } from '@/lib/toast';

interface TransactionReceiptProps {
  bookingId: number;
  transaction: { id: number; [key: string]: any };
  customerName: string;
  customerPhone: string;
  customerPhoneCountry?: string;
  customerAlternatePhone?: string;
  customerAlternatePhoneCountry?: string;
  /** Called when an error occurs (e.g., PDF generation failure) */
  onError?: (message: string) => void;
}

export function TransactionReceipt({
  bookingId,
  transaction,
  customerName,
  customerPhone,
  customerPhoneCountry = 'IN',
  customerAlternatePhone = '',
  customerAlternatePhoneCountry = 'IN',
  onError,
}: TransactionReceiptProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // ── Generate receipt PDF ─────────────────────────────────────────────────

  async function handleGenerate() {
    try {
      setGenerating(true);
      const response = await invoicesApi.generateReceipt(bookingId, transaction.id);

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      setPdfBlob(blob);
      setPdfUrl(url);

      // Get public URL for WhatsApp sharing
      try {
        const urlResponse = await invoicesApi.getReceiptPublicUrl(bookingId, transaction.id);
        const receiptPublicUrl = urlResponse.data.url;
        const fullUrl = urlResponse.data.fullUrl || `${SERVER_BASE_URL}${receiptPublicUrl}`;
        setPublicUrl(makeShareableUrl(fullUrl));
      } catch (urlError) {
        console.warn('Could not get receipt public URL:', urlError);
        setPublicUrl(makeShareableUrl(`${SERVER_BASE_URL}/uploads/Receipt_${bookingId}_${transaction.id}.pdf`));
      }

      setShowPreview(true);
    } catch (error) {
      console.error('Error generating receipt:', error);
      onError?.('Error generating receipt PDF');
    } finally {
      setGenerating(false);
    }
  }

  // ── Download ─────────────────────────────────────────────────────────────

  function handleDownload() {
    if (!pdfBlob) return;
    const url = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Receipt_${bookingId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('Receipt downloaded successfully');
  }

  // ── Print ────────────────────────────────────────────────────────────────

  function handlePrint() {
    if (!pdfUrl) return;
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  }

  // ── WhatsApp share ───────────────────────────────────────────────────────



  function handleShareWhatsApp(phoneType: 'customer' | 'alternate' | 'both' = 'customer') {
    const pdfLink = publicUrl || '';
    const message = `Hi ${customerName}, your transaction receipt for booking #${bookingId} is ready. Download PDF: ${pdfLink}`;

    const phoneNumbers: string[] = [];
    if (phoneType === 'customer' || phoneType === 'both') {
      const p = formatPhoneForWhatsApp(customerPhone, customerPhoneCountry);
      if (p) phoneNumbers.push(p);
    }
    if (phoneType === 'alternate' || phoneType === 'both') {
      const p = formatPhoneForWhatsApp(customerAlternatePhone, customerAlternatePhoneCountry);
      if (p) phoneNumbers.push(p);
    }

    if (phoneNumbers.length === 0) {
      onError?.('No valid phone numbers available');
      return;
    }

    phoneNumbers.forEach((phoneNumber, index) => {
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, index * 500);
    });

    setShowWhatsAppModal(false);
    toast.success(`Opening WhatsApp for ${phoneNumbers.length} number(s)...`);
  }

  // ── Close / cleanup ─────────────────────────────────────────────────────

  function handleClose() {
    setShowPreview(false);
    setShowWhatsAppModal(false);
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
    }
    setPdfBlob(null);
    setPdfUrl(null);
    setPublicUrl(null);
  }

  // ── WhatsApp SVG icon (reused across buttons) ────────────────────────────

  const WhatsAppIcon = (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button — rendered inline in the transaction row */}
      <div className="flex flex-col gap-2 ml-3 flex-shrink-0">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
          title="Generate receipt PDF"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {generating ? 'Generating...' : 'Receipt'}
        </button>
      </div>

      {/* Receipt PDF Preview Modal */}
      {showPreview && pdfUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col">
            {/* Header with Title and Actions */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Transaction Receipt</h2>
                <div className="flex items-center gap-3">
                  {/* Download Button */}
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Download PDF"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>

                  {/* Print Button */}
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Print receipt"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>

                  {/* WhatsApp Share Button */}
                  <button
                    onClick={() => setShowWhatsAppModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    title="Share via WhatsApp"
                  >
                    {WhatsAppIcon}
                    WhatsApp
                  </button>

                  {/* Close Button */}
                  <button
                    onClick={handleClose}
                    className="text-gray-600 hover:text-gray-900 p-2"
                    title="Close"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* PDF Preview */}
            <div className="flex-1 overflow-hidden p-6">
              <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full min-h-[600px]"
                  title="Receipt preview"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Options Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Share via WhatsApp</h2>
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Choose which phone number(s) to share the receipt to:
            </p>

            <div className="space-y-3">
              {customerPhone && (
                <button
                  onClick={() => handleShareWhatsApp('customer')}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">Customer Phone</div>
                    <div className="text-sm text-green-100">{customerPhone}</div>
                  </div>
                  {WhatsAppIcon}
                </button>
              )}

              {customerAlternatePhone && (
                <button
                  onClick={() => handleShareWhatsApp('alternate')}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">Alternate Phone</div>
                    <div className="text-sm text-green-100">{customerAlternatePhone}</div>
                  </div>
                  {WhatsAppIcon}
                </button>
              )}

              {customerPhone && customerAlternatePhone && (
                <button
                  onClick={() => handleShareWhatsApp('both')}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left flex items-center justify-between border-2 border-green-500"
                >
                  <div>
                    <div className="font-semibold">Both Numbers</div>
                    <div className="text-sm text-green-100">Customer & Alternate</div>
                  </div>
                  {WhatsAppIcon}
                </button>
              )}

              {!customerPhone && !customerAlternatePhone && (
                <div className="text-center py-4 text-gray-500">
                  No phone numbers available for this booking
                </div>
              )}
            </div>

            <button
              onClick={() => setShowWhatsAppModal(false)}
              className="w-full mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
