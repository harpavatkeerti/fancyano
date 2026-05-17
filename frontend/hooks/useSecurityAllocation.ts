import { useState, useEffect } from 'react';
import {
  computeSecAllocationPreview,
  toEligibleSecProducts,
} from '@/components/common/SecurityAllocationSection';
import type { EligibleSecProduct, SecAllocationEntry } from '@/components/common/SecurityAllocationSection';
import type { PaymentSummary } from '@/lib/api';

export function useSecurityAllocation() {
  const [securityPortion, setSecurityPortion] = useState(0);
  const [rentPortion, setRentPortion] = useState(0);
  const [boundaryAcknowledged, setBoundaryAcknowledged] = useState(false);
  const [eligibleSecProducts, setEligibleSecProducts] = useState<EligibleSecProduct[]>([]);
  const [selectedSecProductIds, setSelectedSecProductIds] = useState<number[]>([]);
  const [projectedSecAllocation, setProjectedSecAllocation] = useState<SecAllocationEntry[]>([]);
  const [secAllocationError, setSecAllocationError] = useState<string | null>(null);

  // Recompute projected allocation whenever selection or security amount changes
  useEffect(() => {
    if (securityPortion > 0 && eligibleSecProducts.length > 0) {
      const { allocation, error } = computeSecAllocationPreview(
        eligibleSecProducts, selectedSecProductIds, securityPortion,
      );
      setProjectedSecAllocation(allocation);
      setSecAllocationError(error);
    }
  }, [selectedSecProductIds, securityPortion, eligibleSecProducts]);

  /**
   * Called after a security/rent split has been calculated.
   * Sets the two portions, resets the boundary checkbox, and
   * populates or clears the eligible-product list accordingly.
   */
  function updateSplit(
    secAmt: number,
    rentAmt: number,
    summaryProducts: PaymentSummary['products'],
  ) {
    setSecurityPortion(secAmt);
    setRentPortion(rentAmt);
    setBoundaryAcknowledged(false);
    if (secAmt > 0) {
      const eligible = toEligibleSecProducts(summaryProducts);
      setEligibleSecProducts(eligible);
      setSelectedSecProductIds(eligible.map(p => p.bpId));
    } else {
      setEligibleSecProducts([]);
      setSelectedSecProductIds([]);
      setProjectedSecAllocation([]);
      setSecAllocationError(null);
    }
  }

  /** Clears all security allocation state (call on modal close or after submit). */
  function resetAll() {
    setSecurityPortion(0);
    setRentPortion(0);
    setBoundaryAcknowledged(false);
    setEligibleSecProducts([]);
    setSelectedSecProductIds([]);
    setProjectedSecAllocation([]);
    setSecAllocationError(null);
  }

  /**
   * True when the security gate is satisfied — i.e. the CONFIRM button may be enabled
   * from the security-allocation perspective (callers may add further conditions).
   */
  const canConfirmSecurity =
    securityPortion === 0 || (
      (rentPortion === 0 || boundaryAcknowledged) &&
      !secAllocationError &&
      (eligibleSecProducts.length === 0 || selectedSecProductIds.length > 0)
    );

  return {
    securityPortion,
    rentPortion,
    boundaryAcknowledged,
    setBoundaryAcknowledged,
    eligibleSecProducts,
    selectedSecProductIds,
    setSelectedSecProductIds,
    projectedSecAllocation,
    secAllocationError,
    updateSplit,
    resetAll,
    canConfirmSecurity,
  };
}
