'use client';

import { useEffect, useState, useCallback } from 'react';
import { lifecycleApi } from '@/lib/api';
import { integerKeyDown, isIntegerInput } from '@/lib/integerInput';
import { PaymentMethodInput } from './PaymentMethodInput';
import { SecurityAllocationSection } from './SecurityAllocationSection';
import type { EligibleSecProduct, SecAllocationEntry } from './SecurityAllocationSection';
import { computeSecAllocationPreview } from './SecurityAllocationSection';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape returned by GET /security-refund/calculate */
export interface SecurityCalculation {
  booking_id: number;
  booking_product_id: number;
  total_security: number;
  late_fee: number;
  damage_fee: number;
  total_deduction: number;
  net_security: number;
  non_security_pending: number;
  auto_adjust_amount: number;
  remainder_amount: number;
  suggested_late_fee: number;
  late_fee_days: number;
  late_fee_per_day: number;
  eligible_security_products: EligibleSecProduct[];
}

/** The settled amounts sent to processSecurityRefund */
export interface SecuritySettlement {
  late_fee: number;
  damage_fee: number;
  adjust_non_security: number;
  adjust_security_amount: number;
  security_product_ids: number[];
  refund_amount: number;
  payment_method: string;
  notes?: string;
}

export interface RefundSettlementSectionProps {
  bookingId: number;
  bookingProductId: number;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  /** Called with the validated settlement payload when user clicks Confirm */
  onConfirm: (settlement: SecuritySettlement) => Promise<void>;
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RefundSettlementSection({
  bookingId,
  bookingProductId,
  paymentMethod,
  onPaymentMethodChange,
  onConfirm,
  onCancel,
}: RefundSettlementSectionProps) {
  // ── Backend-computed split ───────────────────────────────────────────────────
  const [calc, setCalc] = useState<SecurityCalculation | null>(null);
  const [calcLoading, setCalcLoading] = useState(true);
  const [calcError, setCalcError] = useState<string | null>(null);

  // ── User inputs ──────────────────────────────────────────────────────────────
  const [lateFeeInput, setLateFeeInput] = useState('');
  const [damageFeeInput, setDamageFeeInput] = useState('');
  const [lateFeeInitialized, setLateFeeInitialized] = useState(false);
  const [remainderChoice, setRemainderChoice] = useState<'refund' | 'adjust_security'>('refund');
  const [selectedSecProductIds, setSelectedSecProductIds] = useState<number[]>([]);

  // ── Notes ──────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState('');

  // ── Submit state ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch from backend ───────────────────────────────────────────────────────
  const fetchCalc = useCallback(
    async (lateFee: number | null, damageFee: number) => {
      setCalcLoading(true);
      setCalcError(null);
      try {
        const res = await lifecycleApi.calculateSecurityRefund(bookingId, bookingProductId, lateFee, damageFee);
        const calcData = res.data.security_calculation as SecurityCalculation;
        setCalc(calcData);

        // Pre-populate late fee input from backend's auto-applied value on first load
        if (!lateFeeInitialized) {
          if (calcData.late_fee > 0) {
            setLateFeeInput(String(calcData.late_fee));
          }
          setLateFeeInitialized(true);
        }
      } catch (err: any) {
        setCalcError(
          err?.response?.data?.error ||
          err?.response?.data?.details ||
          err?.message ||
          'Failed to load security calculation'
        );
      } finally {
        setCalcLoading(false);
      }
    },
    [bookingId, bookingProductId, lateFeeInitialized]
  );

  // Fetch on mount — null means "auto-apply suggested late fee from policy"
  useEffect(() => {
    fetchCalc(null, 0);
  }, [fetchCalc]);

  // Re-fetch whenever fee inputs are committed (on blur / Enter)
  // Passes the explicit number (0 = admin chose zero, not "auto-apply")
  function handleFeeCommit() {
    const lateFee = Math.max(0, parseInt(lateFeeInput, 10) || 0);
    const damageFee = Math.max(0, parseInt(damageFeeInput, 10) || 0);
    fetchCalc(lateFee, damageFee);
  }

  // ── Security allocation preview ──────────────────────────────────────────────
  const eligibleProducts: EligibleSecProduct[] = calc?.eligible_security_products ?? [];

  // Auto-select the sole eligible product when switching to adjust_security.
  useEffect(() => {
    if (remainderChoice === 'adjust_security' && eligibleProducts.length === 1 && selectedSecProductIds.length === 0) {
      setSelectedSecProductIds([eligibleProducts[0].bpId]);
    }
  }, [remainderChoice, eligibleProducts]);

  // Capacity of the currently selected security products, and any excess over that
  const totalSelectedCapacity = eligibleProducts
    .filter(p => selectedSecProductIds.includes(p.bpId))
    .reduce((sum, p) => sum + p.remaining, 0);
  const creditAmount = Math.min(calc?.remainder_amount ?? 0, totalSelectedCapacity);
  const secExcess = Math.max(0, (calc?.remainder_amount ?? 0) - creditAmount);

  // Pass only the creditable portion to the allocation preview (avoids spurious over-capacity errors)
  const { allocation: secAllocation, error: secAllocError } = computeSecAllocationPreview(
    eligibleProducts,
    selectedSecProductIds,
    creditAmount
  );

  // ── Validation ───────────────────────────────────────────────────────────────
  const validationError: string | null = (() => {
    if (!calc) return null;
    if (remainderChoice === 'adjust_security') {
      if (calc.remainder_amount > 0 && selectedSecProductIds.length === 0) {
        return 'Select at least one product to credit security against';
      }
    }
    return null;
  })();

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!calc || validationError) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const settlement: SecuritySettlement = {
        late_fee: calc.late_fee,
        damage_fee: calc.damage_fee,
        adjust_non_security: calc.auto_adjust_amount,
        adjust_security_amount: remainderChoice === 'adjust_security' ? creditAmount : 0,
        security_product_ids: remainderChoice === 'adjust_security' ? selectedSecProductIds : [],
        refund_amount: remainderChoice === 'refund' ? calc.remainder_amount : secExcess,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      };
      await onConfirm(settlement);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.details ||
        err?.message ||
        'Failed to process security return';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (calcLoading && !calc) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500">
        Loading security details…
      </div>
    );
  }

  if (calcError && !calc) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
        ⚠️ {calcError}
      </div>
    );
  }

  if (!calc || calc.total_security === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        ⚠️ No security was paid for this product — nothing to refund.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Security summary (all values from backend) ──────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
        <div className="flex justify-between text-gray-700">
          <span>Security paid</span>
          <span className="font-semibold">₹{calc.total_security.toLocaleString('en-IN')}</span>
        </div>
        {calc.non_security_pending > 0 && (
          <div className="flex justify-between text-blue-700 text-xs">
            <span>Pending dues on other products</span>
            <span>₹{calc.non_security_pending.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>

      {/* ── Late Fee + Damage Fee inputs ────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Late Fee */}
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-800">
            Late Fee
          </label>
          <input
            id="refund-late-fee"
            type="number"
            min="0"
            max={calc.total_security}
            placeholder="₹ 0"
            value={lateFeeInput}
            onChange={e => {
              const val = e.target.value;
              if (isIntegerInput(val)) {
                setLateFeeInput(val);
              }
            }}
            onBlur={handleFeeCommit}
            onKeyDown={e => {
              if (e.key === 'Enter') { handleFeeCommit(); return; }
              integerKeyDown(() => lateFeeInput, setLateFeeInput)(e);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
          />
          {calc.late_fee_days > 0 && (
            <p className="text-xs text-gray-500">
              Auto-calculated: {calc.late_fee_days} day(s) × ₹{calc.late_fee_per_day.toLocaleString('en-IN')}/day = ₹{calc.suggested_late_fee.toLocaleString('en-IN')}
            </p>
          )}
        </div>

        {/* Damage Fee */}
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-gray-800">
            Damage Fee
          </label>
          <input
            id="refund-damage-fee"
            type="number"
            min="0"
            max={calc.total_security}
            placeholder="₹ 0"
            value={damageFeeInput}
            onChange={e => {
              const val = e.target.value;
              if (isIntegerInput(val)) {
                setDamageFeeInput(val);
              }
            }}
            onBlur={handleFeeCommit}
            onKeyDown={e => {
              if (e.key === 'Enter') { handleFeeCommit(); return; }
              integerKeyDown(() => damageFeeInput, setDamageFeeInput)(e);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-sm"
          />
        </div>

        {/* Deduction info */}
        {calc.total_deduction > 0 && (
          <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2 space-y-0.5">
            {calc.late_fee > 0 && <p>Late fee: ₹{calc.late_fee.toLocaleString('en-IN')}</p>}
            {calc.damage_fee > 0 && <p>Damage fee: ₹{calc.damage_fee.toLocaleString('en-IN')}</p>}
            <p className="font-medium">Net security available: ₹{calc.net_security.toLocaleString('en-IN')}</p>
          </div>
        )}
        {calcLoading && (
          <p className="text-xs text-gray-400">Recalculating…</p>
        )}
      </div>

      {/* ── Auto-adjust line (backend-computed) ─────────────────────────────── */}
      {calc.auto_adjust_amount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div className="flex justify-between text-blue-800">
            <span>⚡ Auto-adjust against pending dues</span>
            <span className="font-semibold">₹{calc.auto_adjust_amount.toLocaleString('en-IN')}</span>
          </div>
          <p className="text-blue-600 text-xs mt-1">
            Applied automatically to outstanding rent / fees on other products.
          </p>
        </div>
      )}

      {/* ── Remainder choice ──────────────────────────────────────────────────── */}
      {calc.remainder_amount > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-800">
              Remainder: ₹{calc.remainder_amount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              id="remainder-choice-refund"
              type="button"
              onClick={() => setRemainderChoice('refund')}
              className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                remainderChoice === 'refund'
                  ? 'border-red-500 bg-red-50 text-red-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              💸 Refund to customer
            </button>
            <button
              id="remainder-choice-adjust-security"
              type="button"
              onClick={() => setRemainderChoice('adjust_security')}
              disabled={eligibleProducts.length === 0}
              className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                remainderChoice === 'adjust_security'
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              🔒 Credit to security
            </button>
          </div>

          {remainderChoice === 'refund' && (
            <div className="mt-3">
              <PaymentMethodInput
                method={paymentMethod}
                onMethodChange={onPaymentMethodChange}
                colorScheme="red"
                showQR={false}
              />
            </div>
          )}

          {remainderChoice === 'adjust_security' && (
            <>
              <SecurityAllocationSection
                securityAmount={creditAmount || calc.remainder_amount}
                eligibleProducts={eligibleProducts}
                selectedIds={selectedSecProductIds}
                onSelectionChange={setSelectedSecProductIds}
                projectedAllocation={secAllocation}
                error={secAllocError}
              />
              {secExcess > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mt-2">
                  <p className="text-xs font-semibold text-amber-800 mb-2">
                    ₹{secExcess.toLocaleString('en-IN')} exceeds security capacity — refund this to customer
                  </p>
                  <PaymentMethodInput
                    method={paymentMethod}
                    onMethodChange={onPaymentMethodChange}
                    colorScheme="red"
                    showQR={false}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Settlement preview ────────────────────────────────────────────────── */}
      {calc.total_security > 0 && (() => {
        const finalRefund = remainderChoice === 'refund' ? calc.remainder_amount : secExcess;
        const finalCredit = remainderChoice === 'adjust_security' ? creditAmount : 0;
        return (
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 text-sm space-y-1.5">
            <p className="font-semibold text-gray-900 mb-2">Settlement Summary</p>

            <div className="flex justify-between text-gray-800">
              <span>Security deposit</span>
              <span>₹{calc.total_security.toLocaleString('en-IN')}</span>
            </div>

            {calc.late_fee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Late fee</span>
                <span>−₹{calc.late_fee.toLocaleString('en-IN')}</span>
              </div>
            )}
            {calc.damage_fee > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Damage fee</span>
                <span>−₹{calc.damage_fee.toLocaleString('en-IN')}</span>
              </div>
            )}
            {calc.auto_adjust_amount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Adjusted against pending dues</span>
                <span>−₹{calc.auto_adjust_amount.toLocaleString('en-IN')}</span>
              </div>
            )}
            {finalCredit > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Credited to other security</span>
                <span>−₹{finalCredit.toLocaleString('en-IN')}</span>
              </div>
            )}

            <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-bold text-gray-900">
              <span>Refund to customer</span>
              <span>₹{finalRefund.toLocaleString('en-IN')}</span>
            </div>
          </div>
        );
      })()}

      {/* ── Errors ─────────────────────────────────────────────────────────────── */}
      {(validationError || submitError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠️ {validationError || submitError}
        </div>
      )}

      {/* ── Notes ──────────────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-semibold text-gray-800 mb-1">
          Notes (Optional)
        </label>
        <textarea
          id="refund-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Enter reason for refund, reference number, etc."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 resize-none text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          💡 Add any additional details about this refund
        </p>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────────── */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          id="refund-settlement-cancel"
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          id="refund-settlement-confirm"
          type="button"
          onClick={handleConfirm}
          disabled={submitting || !!validationError || !calc}
          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Processing…' : remainderChoice === 'adjust_security' ? 'Confirm Adjustment' : 'Confirm Refund'}
        </button>
      </div>
    </div>
  );
}
