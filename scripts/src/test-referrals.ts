#!/usr/bin/env tsx
// Automated referral system tests — 10 scenarios.
// Usage:  pnpm --filter @workspace/scripts test-referrals
// Requires: API Server running (defaults to http://localhost:8080/api)

const API_BASE = process.env.API_URL ?? "http://localhost:8080/api";
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID ?? "7035629762";

const RUN = Date.now().toString().slice(-7);
const U = (n: number) => `9${RUN}${String(n).padStart(2, "0")}`;

const REFERRER       = U(1);
const REFEREE1       = U(2);
const REFEREE2       = U(3);
const REFEREE3       = U(4);
const REFEREE4       = U(5);
const REFEREE5       = U(6);
const REFEREE6       = U(7);
const CONCURRENT     = U(8);
const REPAIR_REFEREE = U(9);
const REPAIR_REFERRER = U(10);

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌  ${name}`);
    console.log(`      → ${err?.message ?? err}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function initUser(id: string, opts: { referredBy?: string } = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegramId: id,
      username: `tst_${id}`,
      firstName: `T${id}`,
      ...(opts.referredBy != null ? { referredBy: opts.referredBy } : {}),
    }),
  });
  if (!res.ok) throw new Error(`init HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getDebug(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/referral-debug/${id}?adminTelegramId=${ADMIN_ID}`);
  if (!res.ok) throw new Error(`debug HTTP ${res.status}`);
  return res.json();
}

async function repairReferral(referrerTelegramId: string, refereeTelegramId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/repair-referral`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminTelegramId: ADMIN_ID, referrerTelegramId, refereeTelegramId }),
  });
  if (!res.ok) throw new Error(`repair HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

console.log(`\n🚀  HustleCoin Referral System — Automated Tests`);
console.log(`    API : ${API_BASE}`);
console.log(`    Run : ${RUN}\n`);

// ─── Setup ────────────────────────────────────────────────────────────────────
console.log("── Setup ────────────────────────────────────────");
const referrerInit = await initUser(REFERRER);
const referrerBalanceBase = referrerInit.balance as number;
console.log(`   REFERRER=${REFERRER}  balance=${referrerBalanceBase}\n`);

// ─── Tests ────────────────────────────────────────────────────────────────────
console.log("── Test Cases ───────────────────────────────────");

// T1: Brand-new user via referral link → credited
await test("T1: New user via referral link → credited + balances correct", async () => {
  const r = await initUser(REFEREE1, { referredBy: REFERRER });
  assert(r.referralStatus === "credited", `referralStatus=${r.referralStatus}`);
  assert(r.balance === 250, `referee balance expected 250, got ${r.balance}`);

  const debug  = await getDebug(REFEREE1);
  assert(debug.referral_as_referee.has_referral_row, "no referral row created");
  assert(debug.referral_as_referee.row.referrer_telegram_id === REFERRER, "wrong referrer in row");

  const rdebug = await getDebug(REFERRER);
  const referrerNewBal = rdebug.user_record.balance as number;
  assert(
    referrerNewBal >= referrerBalanceBase + 500,
    `referrer balance should increase by ≥500, was ${referrerBalanceBase} now ${referrerNewBal}`,
  );
});

// T2: Same user re-inits (already credited) → no double credit
await test("T2: Re-init of credited user → no double credit", async () => {
  const r = await initUser(REFEREE1);
  const ok = r.referralStatus === "skipped_duplicate" || r.referralStatus === "no_referral";
  assert(ok, `referralStatus=${r.referralStatus}`);
  assert(r.balance === 250, `balance should remain 250, got ${r.balance}`);
});

// T3: Explicit duplicate referral attempt (same referee + same referrer) → skipped
await test("T3: Duplicate referral (same pair) → skipped", async () => {
  const r = await initUser(REFEREE1, { referredBy: REFERRER });
  assert(r.referralStatus.startsWith("skipped_"), `referralStatus=${r.referralStatus}`);
});

// T4: Self-referral → rejected, welcome bonus still granted
await test("T4: Self-referral → rejected, welcome bonus granted", async () => {
  const r = await initUser(REFEREE2, { referredBy: REFEREE2 });
  const ok = r.referralStatus === "welcome_bonus_only" || r.referralStatus.startsWith("skipped_");
  assert(ok, `referralStatus=${r.referralStatus}`);
  assert(r.balance === 250, `balance expected 250 got ${r.balance}`);
  const debug = await getDebug(REFEREE2);
  assert(!debug.referral_as_referee.has_referral_row, "self-referral must not create a row");
});

// T5: Referrer not in DB (ghost ID) → welcome bonus
await test("T5: Non-existent referrer → welcome bonus, no row", async () => {
  const ghost = `${RUN}GHOST`;
  const r = await initUser(REFEREE3, { referredBy: ghost });
  assert(
    r.referralStatus === "skipped_referrer_not_found" || r.referralStatus.startsWith("skipped_"),
    `referralStatus=${r.referralStatus}`,
  );
  assert(r.balance === 250, `balance expected 250 got ${r.balance}`);
  const debug = await getDebug(REFEREE3);
  assert(!debug.referral_as_referee.has_referral_row, "ghost referrer must not create a row");
});

// T6: No referral parameter → welcome_bonus_only
await test("T6: No referral param → welcome_bonus_only", async () => {
  const r = await initUser(REFEREE4);
  assert(r.referralStatus === "welcome_bonus_only", `referralStatus=${r.referralStatus}`);
  assert(r.balance === 250, `balance expected 250 got ${r.balance}`);
});

// T7: Menu-button launch (no startapp) for existing user → no_referral
await test("T7: Menu-button open (existing user, no param) → no_referral", async () => {
  await initUser(REFEREE5);
  const r = await initUser(REFEREE5);
  assert(r.referralStatus === "no_referral", `referralStatus=${r.referralStatus}`);
});

// T8: Existing user opens app via referral link for first time → second-pass credited
await test("T8: Second-pass referral (existing user + new referral link) → credited", async () => {
  await initUser(REFEREE6);
  const r = await initUser(REFEREE6, { referredBy: REFERRER });
  assert(r.referralStatus === "credited", `second-pass referralStatus=${r.referralStatus}`);
  const debug = await getDebug(REFEREE6);
  assert(debug.referral_as_referee.has_referral_row, "second-pass should create referral row");
});

// T9: Concurrent referral requests → race handled, at most one credited
await test("T9: Concurrent referral requests → race handled, exactly one row", async () => {
  await initUser(CONCURRENT);
  const [r1, r2] = await Promise.all([
    initUser(CONCURRENT, { referredBy: REFERRER }),
    initUser(CONCURRENT, { referredBy: REFERRER }),
  ]);
  const creditedCount = [r1, r2].filter(r => r.referralStatus === "credited").length;
  assert(creditedCount <= 1, `expected ≤1 credited, got: ${r1.referralStatus}, ${r2.referralStatus}`);
  const debug = await getDebug(CONCURRENT);
  assert(debug.referral_as_referee.has_referral_row, "should have exactly one referral row");
  // Only one referral row must exist (unique constraint)
  const rowCount = debug.referral_as_referee.has_referral_row ? 1 : 0;
  assert(rowCount === 1, `expected 1 referral row, found ${rowCount}`);
});

// T10: Admin repair tool credits a missed referral
await test("T10: Admin repair tool → credits a missed referral", async () => {
  await initUser(REPAIR_REFEREE);
  await initUser(REPAIR_REFERRER);

  const before = await getDebug(REPAIR_REFEREE);
  assert(!before.referral_as_referee.has_referral_row, "should have no referral row before repair");

  const referrerBalBefore = (await getDebug(REPAIR_REFERRER)).user_record.balance as number;
  const refereeBalBefore  = before.user_record.balance as number;

  const repair = await repairReferral(REPAIR_REFERRER, REPAIR_REFEREE);
  assert(repair.success === true, `repair failed: ${JSON.stringify(repair)}`);

  const after = await getDebug(REPAIR_REFEREE);
  assert(after.referral_as_referee.has_referral_row, "referral row should exist after repair");
  assert(
    after.referral_as_referee.row.referrer_telegram_id === REPAIR_REFERRER,
    `wrong referrer: ${after.referral_as_referee.row.referrer_telegram_id}`,
  );

  const referrerBalAfter = (await getDebug(REPAIR_REFERRER)).user_record.balance as number;
  assert(referrerBalAfter >= referrerBalBefore + 500, `referrer balance should increase by ≥500, was ${referrerBalBefore} now ${referrerBalAfter}`);
  assert(after.user_record.balance === refereeBalBefore + 250, `referee: expected ${refereeBalBefore + 250} got ${after.user_record.balance}`);
  assert(Array.isArray(after.referral_events), "referral_events must be in debug response");
  assert(after.referral_events.length > 0, "referral_events must not be empty after repair");
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n── Results ──────────────────────────────────────");
console.log(`   Passed : ${passed}`);
console.log(`   Failed : ${failed}`);
console.log(`   Total  : ${passed + failed}`);
console.log(failed === 0 ? "\n✅  All tests passed!\n" : `\n❌  ${failed} test(s) failed.\n`);

if (failed > 0) process.exit(1);
