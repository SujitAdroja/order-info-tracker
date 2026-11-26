/**
 * Product switches. Warranty tracking is built but hidden (2026-11-26: keep
 * the app simple). Warranty dates are still computed and stored, so turning
 * this back on shows correct data immediately. See IMPLEMENTATION_PLAN.md
 * "Phase 8 — Warranty tracking".
 */
export const FEATURES = {
  warranty: false,
} as const;
