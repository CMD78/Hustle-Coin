import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetProfile, useMineHp } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Flame, Pickaxe } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MINE_COOLDOWN = 24 * 60 * 60; // 24 hours in seconds

function CircularProgress({ progress, size = 280, strokeWidth = 8, children }: {
  progress: number; // 0 to 1
  size?: number;
  strokeWidth?: number;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
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
  const [floatingHp, setFloatingHp] = useState<{ id: number; hp: number; x: number; y: number }[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.mineCountdown && profile.mineCountdown > 0) {
      setCountdown(profile.mineCountdown);
    } else {
      setCountdown(null);
    }
  }, [profile?.mineCountdown]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const handleMine = (e: React.MouseEvent | React.TouchEvent) => {
    if (countdown !== null && countdown > 0) return;
    if (!profile?.canMine) return;

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const newId = Date.now();
    setFloatingHp(prev => [...prev, { id: newId, hp: 100, x: clientX, y: clientY }]);
    setTimeout(() => {
      setFloatingHp(prev => prev.filter(f => f.id !== newId));
    }, 1000);

    if (navigator.vibrate) navigator.vibrate(50);

    mineHp.mutate({ data: { telegramId } }, {
      onSuccess: (data) => {
        if (data.nextMineAt) {
          const next = new Date(data.nextMineAt).getTime();
          const now = Date.now();
          if (next > now) {
            setCountdown(Math.floor((next - now) / 1000));
          }
        }
        queryClient.setQueryData(
          [`/api/profile`, { telegramId }],
          (old: any) => old ? { ...old, balance: data.newBalance, streak: data.streak, canMine: false } : old
        );
        queryClient.invalidateQueries({ queryKey: [`/api/dashboard`, { telegramId }] });
      },
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  const isCooling = countdown !== null && countdown > 0;
  const progress = isCooling ? 1 - countdown / MINE_COOLDOWN : 1;

  return (
    <div className="flex flex-col items-center min-h-[80vh] relative animate-in fade-in duration-500 pt-4">

      <AnimatePresence>
        {floatingHp.map(f => (
          <motion.div
            key={f.id}
            initial={{ opacity: 1, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, y: -150, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed z-50 text-3xl font-black text-primary pointer-events-none drop-shadow-md"
            style={{ left: f.x - 20, top: f.y - 20 }}
          >
            +{f.hp}
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black tracking-tight">Mining</h1>
        <div className="mt-2">
          {isCooling ? (
            <span className="inline-flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              Mining Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 text-primary text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Ready to Mine
            </span>
          )}
        </div>
      </div>

      <CircularProgress progress={isCooling ? 1 - progress : 1} size={280} strokeWidth={8}>
        <motion.button
          whileHover={!isCooling ? { scale: 1.05 } : {}}
          whileTap={!isCooling ? { scale: 0.93 } : {}}
          onClick={handleMine}
          onTouchStart={handleMine}
          disabled={isCooling || !profile?.canMine}
          className={`w-56 h-56 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 relative border-4 overflow-hidden
            ${isCooling
              ? "bg-muted border-border cursor-not-allowed"
              : "bg-gradient-to-b from-yellow-500 to-amber-600 border-yellow-400 cursor-pointer hover:shadow-[0_0_60px_rgba(250,204,21,0.45)]"
            }`}
        >
          {isCooling ? (
            <>
              <div className="text-center">
                <p className="text-xs text-muted-foreground font-semibold mb-1 uppercase tracking-wider">Mining In Progress</p>
                <p className="text-2xl font-black font-mono text-foreground">{formatTime(countdown!)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Next session available</p>
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <Coins className="w-20 h-20 text-white drop-shadow-lg mb-1 relative z-10" />
              <span className="text-2xl font-black text-white drop-shadow-md relative z-10">MINE HC</span>
              <span className="text-xs text-white/70 relative z-10 mt-0.5">Tap to earn</span>
            </>
          )}
        </motion.button>
      </CircularProgress>

      <div className="mt-8 w-full max-w-xs grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Pickaxe className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <div className="text-lg font-black text-blue-400">{profile?.totalMines ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Total Sessions</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Flame className="w-4 h-4 text-orange-400 mx-auto mb-1" />
          <div className="text-lg font-black text-orange-400">{profile?.streak ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">Day Streak</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-3 text-center">
          <Coins className="w-4 h-4 text-primary mx-auto mb-1" />
          <div className="text-lg font-black text-primary">{(profile?.totalHpMined ?? 0).toLocaleString()}</div>
          <div className="text-[10px] text-muted-foreground">HC Mined</div>
        </div>
      </div>

      <p className="mt-6 text-muted-foreground text-xs max-w-[240px] text-center">
        {isCooling
          ? "24-hour mining session active. Return when the timer ends."
          : "Tap the coin to start your 24-hour mining session."}
      </p>
    </div>
  );
}
