'use client';

/**
 * Converts a `PaymentSummary.products` entry into `EligibleSecProduct[]`,
 * filtering out products that have no outstanding security.
 * Both the salesman page and PaymentManagement share this adapter.
 */
export function toEligibleSecProducts(
  summaryProducts: Array<{
    booking_product_id: number;
    product_name: string;
    product_code: string;
    status: string;
    booked_from: string;
    charges: Array<{ charge_type: string; due_amount: number; paid_amount: number }>;
  }>,
): EligibleSecProduct[] {
  return summaryProducts
    .filter(p => {
      const sec = p.charges.find(c => c.charge_type === 'security');
      return (
        !['exchanged', 'cancelled', 'completed'].includes(p.status) &&
        sec != null &&
        sec.due_amount - sec.paid_amount > 0
      );
    })
    .map(p => {
      const sec = p.charges.find(c => c.charge_type === 'security')!;
      return {
        bpId: p.booking_product_id,
        name: p.product_name,
        code: p.product_code,
        due: sec.due_amount,
        paid: sec.paid_amount,
        remaining: sec.due_amount - sec.paid_amount,
        bookedFrom: p.booked_from,
      };
    });
}

/**
 * Pure helper — computes the projected security allocation for a given selection.
 * Returns the fill order (partial-paid first, then by pickup date) and an error
 * string if the selected products cannot absorb the full security amount.
 */
export function computeSecAllocationPreview(
  eligibleProducts: EligibleSecProduct[],
  selectedIds: number[],
  secAmount: number,
): { allocation: SecAllocationEntry[]; error: string | null } {
  const selected = eligibleProducts
    .filter(p => selectedIds.includes(p.bpId))
    .sort((a, b) => {
      if (a.paid > 0 && b.paid === 0) return -1;
      if (a.paid === 0 && b.paid > 0) return 1;
      if (a.paid > 0 && b.paid > 0) return a.remaining - b.remaining;
      return new Date(a.bookedFrom).getTime() - new Date(b.bookedFrom).getTime();
    });

  const totalCapacity = selected.reduce((s, p) => s + p.remaining, 0);

  if (selected.length > 0 && totalCapacity < secAmount) {
    return {
      allocation: [],
      error:
        `Selected products can absorb ₹${totalCapacity.toLocaleString('en-IN')} ` +
        `but ₹${secAmount.toLocaleString('en-IN')} needs to be credited. ` +
        `Select more products or reduce the payment amount.`,
    };
  }

  let remaining = secAmount;
  const allocation: SecAllocationEntry[] = [];
  for (const p of selected) {
    if (remaining <= 0) break;
    const toApply = Math.min(remaining, p.remaining);
    allocation.push({ bpId: p.bpId, name: p.name, amount: toApply });
    remaining -= toApply;
  }

  return { allocation, error: null };
}

export interface EligibleSecProduct {
  bpId: number;
  name: string;
  code: string;
  due: number;
  paid: number;
  remaining: number;
  bookedFrom: string;
}

export interface SecAllocationEntry {
  bpId: number;
  name: string;
  amount: number;
}

interface SecurityAllocationSectionProps {
  securityAmount: number;
  eligibleProducts: EligibleSecProduct[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  projectedAllocation: SecAllocationEntry[];
  error: string | null;
}

export function SecurityAllocationSection({
  securityAmount,
  eligibleProducts,
  selectedIds,
  onSelectionChange,
  projectedAllocation,
  error,
}: SecurityAllocationSectionProps) {
  return (
    <div className="mt-4 border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">
        🔒 Security Allocation
        <span className="ml-2 text-gray-500 font-normal text-xs">
          ₹{securityAmount.toLocaleString('en-IN')} to credit
        </span>
      </h4>

      {eligibleProducts.length === 1 ? (
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
          <p>Will be credited to <strong>{eligibleProducts[0].name}</strong> ({eligibleProducts[0].code})</p>
          <p className="text-xs text-gray-500 mt-1">
            Security: ₹{eligibleProducts[0].due.toLocaleString('en-IN')} due /
            ₹{eligibleProducts[0].paid.toLocaleString('en-IN')} paid /
            ₹{eligibleProducts[0].remaining.toLocaleString('en-IN')} remaining
          </p>
        </div>
      ) : eligibleProducts.length === 0 ? (
        <p className="text-sm text-gray-500">No products with outstanding security.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-2">Choose which product(s) to credit security against:</p>
          {eligibleProducts.map(p => {
            const isSelected = selectedIds.includes(p.bpId);
            return (
              <label
                key={p.bpId}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => {
                    if (e.target.checked) {
                      onSelectionChange([...selectedIds, p.bpId]);
                    } else {
                      onSelectionChange(selectedIds.filter(id => id !== p.bpId));
                    }
                  }}
                  className="mt-0.5 w-4 h-4 text-green-600 rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.code}</p>
                    </div>
                    <div className="text-right text-xs text-gray-600">
                      <p>Due: ₹{p.due.toLocaleString('en-IN')}</p>
                      <p>Paid: ₹{p.paid.toLocaleString('en-IN')}</p>
                      {p.paid > 0 && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                          partially paid
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {projectedAllocation.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-2">Projected allocation:</p>
          <div className="space-y-1">
            {projectedAllocation.map(a => (
              <div key={a.bpId} className="flex justify-between text-xs text-gray-600">
                <span>{a.name}</span>
                <span className="font-medium">+₹{a.amount.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs font-semibold text-green-700 pt-1 border-t border-gray-200 mt-1">
              <span>Total credited</span>
              <span>₹{securityAmount.toLocaleString('en-IN')} ✅</span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">⚠️ {error}</p>
        </div>
      )}
    </div>
  );
}
