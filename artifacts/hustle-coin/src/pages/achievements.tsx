import { useTelegram } from "@/lib/telegram";
import { useGetAchievements } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Lock, Trophy } from "lucide-react";

export default function Achievements() {
  const { telegramId } = useTelegram();
  const { data: achievements, isLoading } = useGetAchievements(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const unlocked = achievements?.filter(a => a.unlocked) ?? [];
  const locked = achievements?.filter(a => !a.unlocked) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
          <p className="text-muted-foreground text-sm mt-1">Unlock badges as you hustle</p>
        </div>
        <div className="bg-card border border-border rounded-full px-3 py-1.5 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">{unlocked.length}/{achievements?.length ?? 0}</span>
        </div>
      </div>

      {unlocked.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Unlocked</h2>
          <div className="grid grid-cols-2 gap-3">
            {unlocked.map((ach, i) => (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06 }}
                className="bg-gradient-to-br from-card to-card/50 border border-primary/30 rounded-2xl p-4 flex flex-col items-center text-center relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-primary/5" />
                <div className="text-3xl mb-2 relative z-10">{ach.icon}</div>
                <h3 className="font-bold text-xs relative z-10 leading-tight">{ach.title}</h3>
                <p className="text-[10px] text-muted-foreground mt-1 relative z-10">{ach.description}</p>
                {ach.unlockedAt && (
                  <p className="text-[9px] text-primary/70 mt-1.5 relative z-10">
                    {new Date(ach.unlockedAt).toLocaleDateString()}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Locked</h2>
          <div className="grid grid-cols-2 gap-3">
            {locked.map((ach, i) => (
              <motion.div
                key={ach.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center text-center opacity-50"
              >
                <div className="text-3xl mb-2 grayscale">{ach.icon}</div>
                <h3 className="font-bold text-xs leading-tight">{ach.title}</h3>
                <p className="text-[10px] text-muted-foreground mt-1">{ach.description}</p>
                <Lock className="w-3 h-3 text-muted-foreground mt-2" />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
