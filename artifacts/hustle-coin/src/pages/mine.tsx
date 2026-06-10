import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetProfile, useMineHp } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Flame, Timer } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Mine() {
  const { telegramId } = useTelegram();
  const queryClient = useQueryClient();
  
  const { data: profile } = useGetProfile(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );
  
  const mineHp = useMineHp();
  const [floatingHp, setFloatingHp] = useState<{id: number, hp: number, x: number, y: number}[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.mineCountdown && profile.mineCountdown > 0) {
      // mineCountdown is already in seconds from the API — do not divide by 1000
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

    // Trigger visual effect
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    // Add floating number
    const newId = Date.now();
    setFloatingHp(prev => [...prev, { id: newId, hp: 20, x: clientX, y: clientY }]);
    
    // Remove after animation
    setTimeout(() => {
      setFloatingHp(prev => prev.filter(f => f.id !== newId));
    }, 1000);

    // Vibrate if supported
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
        
        // Optimistic update for balance
        queryClient.setQueryData(
          [`/api/profile`, { telegramId }],
          (old: any) => old ? { ...old, balance: data.newBalance, streak: data.streak, canMine: false } : old
        );
        
        // Refetch dashboard
        queryClient.invalidateQueries({ queryKey: [`/api/dashboard`, { telegramId }] });
      }
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] relative animate-in fade-in duration-500">
      
      {/* Floating HP animations */}
      <AnimatePresence>
        {floatingHp.map(f => (
          <motion.div
            key={f.id}
            initial={{ opacity: 1, y: 0, x: 0, scale: 0.5 }}
            animate={{ opacity: 0, y: -150, x: (Math.random() - 0.5) * 50, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed z-50 text-3xl font-black text-primary pointer-events-none drop-shadow-md"
            style={{ left: f.x - 20, top: f.y - 20 }}
          >
            +{f.hp}
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="absolute top-0 w-full flex justify-between px-2">
        <div className="bg-card/80 backdrop-blur border border-border rounded-full px-4 py-2 flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary" />
          <span className="font-black text-lg">{profile?.balance?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-card/80 backdrop-blur border border-border rounded-full px-4 py-2 flex items-center gap-2">
          <Flame className={`w-5 h-5 ${profile?.streak && profile.streak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
          <span className="font-bold">{profile?.streak || 0}</span>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleMine}
        onTouchStart={handleMine}
        disabled={countdown !== null && countdown > 0 || !profile?.canMine}
        className={`w-64 h-64 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-300 relative border-4 overflow-hidden
          ${countdown !== null && countdown > 0 
            ? 'bg-muted border-border cursor-not-allowed opacity-80' 
            : 'bg-gradient-to-b from-yellow-500 to-amber-600 border-yellow-400 cursor-pointer hover:shadow-[0_0_50px_rgba(250,204,21,0.5)]'
          }`}
      >
        {countdown !== null && countdown > 0 ? (
          <>
            <Timer className="w-16 h-16 text-muted-foreground mb-2" />
            <span className="text-xl font-mono font-bold text-muted-foreground">{formatTime(countdown)}</span>
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <Coins className="w-24 h-24 text-white drop-shadow-lg mb-2 relative z-10" />
            <span className="text-3xl font-black text-white drop-shadow-md relative z-10">MINE HP</span>
          </>
        )}
      </motion.button>
      
      <p className="mt-12 text-muted-foreground text-sm max-w-[250px] text-center">
        {countdown !== null && countdown > 0 
          ? "Mining cooldown active. Upgrade your rig to mine faster." 
          : "Tap the coin to mine your daily HP allowance."}
      </p>
    </div>
  );
}
