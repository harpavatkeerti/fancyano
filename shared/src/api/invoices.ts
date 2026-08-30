import { AxiosInstance } from 'axios';

export type InvoiceType = 'estimate' | 'invoice' | 'tax-invoice';

export interface InvoiceUrlResponse {
  url: string;
  fullUrl?: string;
}

export interface SendEmailRequest {
  bookingId: number;
  documentType: InvoiceType;
  customerName: string;
  customerEmail: string;
  pdfUrl: string;
}

export interface SendEmailResponse {
  success: boolean;
  error?: string;
  useMailto?: boolean;
}

export function createInvoicesApi(api: AxiosInstance) {
  return {
    /**
     * Generates the PDF server-side and returns the raw blob for in-browser preview.
     * Pass `{ responseType: 'blob' }` via the axios config in the third argument.
     */
    generate: (type: InvoiceType, bookingId: number) =>
      api.post<Blob>(
        `/invoices/${type}/${bookingId}`,
        {},
        { responseType: 'blob' }
      ),

    /**
     * Returns the public URL for a previously generated document (for WhatsApp / sharing).
     */
    getPublicUrl: (type: InvoiceType, bookingId: number) =>
      api.get<InvoiceUrlResponse>(`/invoices/${type}/${bookingId}`),

    /**
     * Generates a transaction receipt PDF and returns the raw blob for in-browser preview.
     */
    generateReceipt: (bookingId: number, transactionId: number) =>
      api.post<Blob>(
        `/invoices/receipt/${bookingId}/${transactionId}`,
        {},
        { responseType: 'blob' }
      ),

    /**
     * Returns the public URL for a transaction receipt (for WhatsApp sharing).
     */
    getReceiptPublicUrl: (bookingId: number, transactionId: number) =>
      api.get<InvoiceUrlResponse>(`/invoices/receipt/${bookingId}/${transactionId}`),

    /**
     * Sends the document to the customer via email using the backend mailer.
     * Falls back to mailto: on the client if the backend is not configured.
     */
    sendEmail: (data: SendEmailRequest) =>
      api.post<SendEmailResponse>('/invoices/send-email', data),
  };
}
