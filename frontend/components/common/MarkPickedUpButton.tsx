'use client';

import { useState } from 'react';
import { lifecycleApi } from '@/lib/api';
import { toast } from '@/lib/toast';

interface MarkPickedUpButtonProps {
  product: any;
  bookingId: number;
  /** Who is performing the pickup — passed as picked_up_by to the API */
  pickedUpBy: string;
  /** Called after a successful pickup — typically fetchBooking() to refresh product statuses */
  onSuccess: () => Promise<void>;
}

export function MarkPickedUpButton({ product, bookingId, pickedUpBy, onSuccess }: MarkPickedUpButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    setIsLoading(true);
    try {
      await lifecycleApi.pickupProducts(bookingId, {
        booking_product_ids: [product.id],
        picked_up_by: pickedUpBy,
      });
      toast.success(`${product.name} marked as picked up`);
      await onSuccess();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to mark as picked up');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        id={`mark-picked-up-${product.id}`}
        onClick={handleClick}
        disabled={isLoading}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
      >
        {isLoading ? '⏳ Marking...' : '🚚 Mark Picked Up'}
      </button>
    </div>
  );
}
