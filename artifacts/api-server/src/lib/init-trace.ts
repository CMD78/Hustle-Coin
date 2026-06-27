// Temporary in-memory trace store for /api/init diagnostics.
// Keeps the last MAX_TRACES_PER_USER calls per telegramId.
// No database writes — drop this file when investigation is complete.

export interface InitTrace {
  timestamp: string;
  telegramId: string;
  username: string | undefined;
  is_new_user: boolean;
  // ── What the frontend sent ─────────────────────────────────────────────────
  raw_init_data: string | null;
  start_param_from_init_data: string | null; // parsed from initData URL params
  request_body_referred_by: string | null | undefined; // raw req.body.referredBy
  // ── What the backend computed ──────────────────────────────────────────────
  effective_referred_by: string | null;      // after self-referral filter
  // ── Referral link the user shares ─────────────────────────────────────────
  app_shortname: string | null;
  bot_username: string;
  referral_link: string;
  referral_link_uses_startapp: boolean;      // true = ?startapp= | false = ?start=
}

const MAX_TRACES_PER_USER = 5;
const store = new Map<string, InitTrace[]>();

export function recordInitTrace(trace: InitTrace): void {
  const existing = store.get(trace.telegramId) ?? [];
  existing.unshift(trace); // newest first
  if (existing.length > MAX_TRACES_PER_USER) existing.length = MAX_TRACES_PER_USER;
  store.set(trace.telegramId, existing);
}

export function getInitTraces(telegramId: string): InitTrace[] {
  return store.get(telegramId) ?? [];
}

export function getAllTracedUsers(): string[] {
  return Array.from(store.keys());
}
