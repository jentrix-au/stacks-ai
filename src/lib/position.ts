/**
 * Fractional positioning helpers for cheap reorders.
 *
 * Strategy: each ordered item has a numeric `position`. To insert between two
 * items, take the midpoint of their positions. New items get pushed to the
 * end (last + STEP).
 *
 * When the gap between neighbors gets too small (precision loss), call
 * `rebalance` to renumber the list. In practice this rarely matters until
 * tens of thousands of moves on the same row.
 */

export const POSITION_STEP = 1024;
const MIN_GAP = 1e-6;

export function positionBefore(first: number): number {
  return first - POSITION_STEP;
}

export function positionAfter(last: number): number {
  return last + POSITION_STEP;
}

export function positionBetween(a: number, b: number): number {
  return (a + b) / 2;
}

export function needsRebalance(prev: number, next: number): boolean {
  return Math.abs(next - prev) < MIN_GAP;
}

/**
 * Compute the new position for an item being dropped at index `targetIndex`
 * within a list of positions. Pass `null` for the dragged item's own slot
 * if it was filtered out of `siblings`.
 */
export function computeDropPosition(
  siblings: number[],
  targetIndex: number,
): number {
  if (siblings.length === 0) return 0;
  if (targetIndex <= 0) return positionBefore(siblings[0]);
  if (targetIndex >= siblings.length)
    return positionAfter(siblings[siblings.length - 1]);
  return positionBetween(siblings[targetIndex - 1], siblings[targetIndex]);
}

/** Returns a fully renumbered list starting at STEP and incrementing by STEP. */
export function rebalance(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
}
