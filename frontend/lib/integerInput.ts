import React from 'react';

/**
 * Returns an onKeyDown handler that prevents decimal input on number fields.
 * - Blocks '.', 'e', 'E' keys
 * - Overrides ArrowUp/ArrowDown to step by the given `step` (default 1) as integers
 *
 * @param getValue  - returns the current value as a string
 * @param setValue  - sets the new value as a string
 * @param step      - integer step for arrow keys (default 1)
 */
export function integerKeyDown(
  getValue: () => string,
  setValue: (v: string) => void,
  step = 1
): React.KeyboardEventHandler<HTMLInputElement> {
  return (e) => {
    // Block decimal point and scientific notation
    if (e.key === '.' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      return;
    }
    // Override arrow keys to step by whole integers
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseInt(getValue()) || 0;
      const next = e.key === 'ArrowUp' ? current + step : Math.max(0, current - step);
      setValue(String(next));
    }
  };
}

/**
 * Validates that a string is either empty or contains only digits (integer input).
 * Use in onChange handlers to gate the setter:
 *
 *   onChange={(e) => { if (isIntegerInput(e.target.value)) setValue(e.target.value); }}
 */
export function isIntegerInput(value: string): boolean {
  return value === '' || /^[0-9]+$/.test(value);
}
