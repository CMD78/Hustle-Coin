import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetProfile, useMineHp } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Flame, Pickaxe, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MINE_COOLDOWN_SECS = 24 * 60 * 60;

// ── Three distinct mining states ─────────────────────────────────────────────
// "idle"   — no session has ever been started (lastMine = null)
// "mining" — session is in progress, countdown > 0
// "claim"  — 24 h elapsed, rewards are waiting to be claimed
// ─────────────────────────────────────────────────────────────────────────────
type MineState = "idle" | "mining" | "claim";

function CircularProgress({
  progress,
  size = 280,
  strokeWidth = 8,
  children,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export default function Mine() {
  const { telegramId } = useTelegram();
  const queryClient = useQueryClient();

  const { data: profile } = useGetProfile(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  const mineHp = useMineHp();

  // Fix #3: floating HP only rendered on confirmed server success (moved out of click handler)
  const [floatingHp, setFloatingHp] = useState<{ id: number; hp: number }[]>([]);

  // Local countdown seeded from server; ticks down with setTimeout
  const [countdown, setCountdown] = useState<number | null>(null);

  // Seed countdown when profile arrives or refreshes
  useEffect(() => {
    if (profile?.mineCountdown && profile.mineCountdown > 0) {
      setCountdown(profile.mineCountdown);
    } else {
      setCountdown(null);
    }
  }, [profile?.mineCountdown]);

  // Tick — uses setTimeout so we don't need to worry about stale closures
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((c) => (c !== null && c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ── Derive state ────────────────────────────────────────────────────────────
  const hasSession = !!profile?.lastMine;
  const countdownActive = countdown !== null && countdown > 0;

  let mineState: MineState;
  if (!hasSession) {
    mineState = "idle";
  } else if (countdownActive || profile?.canMine === false) {
    mineState = "mining";
  } else {
    mineState = "claim";
  }

  // ── Progress ring ───────────────────────────────────────────────────────────
  // 0 = session just started / not started; 1 = session complete / ready to claim
  let ringProgress: number;
  if (mineState === "idle") {
    ringProgress = 0;
  } else if (mineState === "claim") {
    ringProgress = 1;
  } else {
    // filling as time elapses: 0 → 1 over MINE_COOLDOWN_SECS
    ringProgress = countdown !== null
      ? Math.max(0, (MINE_COOLDOWN_SECS - countdown) / MINE_COOLDOWN_SECS)
      : 0;
  }

  // ── Click handler ───────────────────────────────────────────────────────────
  // Fix #1: only onClick — no onTouchStart (removes double-fire on mobile)
  // Fix #3: floating HP moved to onSuccess
  // Fix #2: isPending guard added
  const handleAction = () => {
    if (mineState === "mining") return;
    if (mineHp.isPending) return;  // Fix #3: in-flight guard

    mineHp.mutate(
      { data: { telegramId } },
      {
        onSuccess: (data: any) => {
          if (!data.success) return;

          // Fix #2: floating HP fires ONLY here, after server confirms
          const totalHp = (data.hpEarned ?? 0) + (data.bonusHp ?? 0);
          const id = Date.now();
          setFloatingHp((prev) => [...prev, { id, hp: totalHp }]);
          setTimeout(
            () => setFloatingHp((prev) => prev.filter((f) => f.id !== id)),
            1200
          );

          // Seed the new countdown from the server's nextMineAt
          if (data.nextMineAt) {
            const remaining = Math.floor(
              (new Date(data.nextMineAt).getTime() - Date.now()) / 1000
            );
            setCountdown(remaining > 0 ? remaining : null);
          }

          queryClient.invalidateQueries({
            queryKey: [`/api/profile`, { telegramId }],
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/dashboard`, { telegramId }],
          });
        },
      }
    );
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  };

  return (
    <div className="flex flex-col items-center min-h-[80vh] relative animate-in fade-in duration-500 pt-4">

      {/* Fix #2: floating HP anchored to center — appears only after server confirms */}
      <AnimatePresence>
        {floatingHp.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 1, y: 0, scale: 0.6 }}
            animate={{ opacity: 0, y: -160, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            className="fixed z-50 text-3xl font-black text-primary pointer-events-none drop-shadow-lg"
            style={{ left: "50%", top: "40%", transform: "translateX(-50%)" }}
          >
            +{f.hp} HC
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Header + state badge */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black tracking-tight">Mining</h1>
        <div className="mt-2">
          {mineState === "mining" && (
            <span className="inline-flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              Mining Active
            </span>
          )}
          {mineState === "claim" && (
            <span className="inline-flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Ready to Claim
            </span>
          )}
          {mineState === "idle" && (
            <span className="inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 text-primary text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              No Active Session
            </span>
          )}
        </div>
      </div>

      {/* Fix #6: ring fills 0→1 as session progresses (Pi Network style) */}
      <CircularProgress progress={ringProgress} size={280} strokeWidth={8}>
        <motion.button
          whileHover={mineState !== "mining" ? { scale: 1.05 } : {}}
          whileTap={mineState !== "mining" ? { scale: 0.93 } : {}}
          // Fix #1: only onClick — removed onTouchStart that caused double-fire on mobile
          onClick={handleAction}
          disabled={mineState === "mining" || mineHp.isPending}
          className={`w-56 h-56 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 relative border-4 overflow-hidden
            ${mineState === "mining"
              ? "bg-muted border-border cursor-not-allowed"
              : mineState === "claim"
              ? "bg-gradient-to-b from-green-500 to-emerald-600 border-green-400 cursor-pointer hover:shadow-[0_0_60px_rgba(34,197,94,0.45)]"
              : "bg-gradient-to-b from-yellow-500 to-amber-600 border-yellow-400 cursor-pointer hover:shadow-[0_0_60px_rgba(250,204,21,0.45)]"
            }`}
        >
          {mineState === "mining" && (
            <div className="text-center px-4">
              <p className="text-[10px] text-muted-foreground font-semibold mb-1 uppercase tracking-wider">
                Mining In Progress
              </p>
              <p className="text-2xl font-black font-mono text-foreground">
                {countdown !== null ? formatTime(countdown) : "--:--"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                until claim available
              </p>
            </div>
          )}

          {/* Fix #5: "Start Mining" label for idle state */}
          {mineState === "idle" && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <Pickaxe className="w-16 h-16 text-white drop-shadow-lg mb-1 relative z-10" />
              <span className="text-xl font-black text-white drop-shadow-md relative z-10">
                {mineHp.isPending ? "Starting…" : "Start Mining"}
              </span>
              <span className="text-xs text-white/70 relative z-10 mt-0.5">
                24-hour session
              </span>
            </>
          )}

          {/* Fix #5: "Claim HC" label for claim state */}
          {mineState === "claim" && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <Coins className="w-16 h-16 text-white drop-shadow-lg mb-1 relative z-10" />
              <span className="text-xl font-black text-white drop-shadow-md relative z-10">
                {mineHp.isPending ? "Claiming…" : "Claim HC"}
              </span>
              <span className="text-xs text-white/70 relative z-10 mt-0.5">
                +100 HC + streak bonus
              </span>
            </>
          )}
        </motion.button>
      </CircularProgress>

      {/* Stats row */}
      <div className="mt-8 w-full max-w-xs grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Pickaxe className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <div className="text-lg font-black text-blue-400">{profile?.totalMines ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Sessions</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Flame className="w-4 h-4 text-orange-400 mx-auto mb-1" />
          <div className="text-lg font-black text-orange-400">{profile?.streak ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Day Streak</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Zap className="w-4 h-4 text-primary mx-auto mb-1" />
          <div className="text-lg font-black text-primary">
            {(profile?.totalHpMined ?? 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground">HC Mined</div>
        </div>
      </div>

      {/* Contextual description */}
      <p className="mt-6 text-muted-foreground text-xs max-w-[240px] text-center leading-relaxed">
        {mineState === "mining"
          ? "Your 24-hour mining session is running. Come back when the timer ends to claim your HC."
          : mineState === "claim"
          ? "Session complete! Claim your HC to instantly start the next 24-hour session."
          : "Start your first 24-hour mining session. You'll earn HC coins that you can claim when it completes."}
      </p>
    </div>
  );
}
