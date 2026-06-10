import { useTelegram } from "@/lib/telegram";
import { useGetDashboard } from "@workspace/api-client-react";
import { Coins, Zap, Trophy, ArrowRight, Pickaxe } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Home() {
  const { telegramId } = useTelegram();
  const { data: dashboard, isLoading } = useGetDashboard(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[50vh]"><div className="animate-spin text-primary"><Zap size={32} /></div></div>;
  }

  if (!dashboard) return null;

  const { user } = dashboard;
  
  const thresholds = [0, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  const currentThreshold = thresholds[user.level - 1] || 0;
  const nextThreshold = thresholds[user.level] || 50000;
  const progress = Math.min(100, Math.max(0, ((user.balance - currentThreshold) / (nextThreshold - currentThreshold)) * 100));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HustleCoin</h1>
          <p className="text-muted-foreground text-sm">Welcome back, {user.firstName}</p>
        </div>
        <div className="bg-card px-3 py-1.5 rounded-full border border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="font-bold font-mono text-primary">Lvl {user.level}</span>
        </div>
      </div>

      <motion.div 
        className="bg-gradient-to-br from-card to-card/50 border border-border rounded-2xl p-6 text-center shadow-lg relative overflow-hidden"
        whileTap={{ scale: 0.98 }}
      >
        <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full" />
        <p className="text-muted-foreground mb-2 relative z-10">Total Balance</p>
        <div className="flex items-center justify-center gap-3 relative z-10">
          <Coins className="w-10 h-10 text-primary" />
          <span className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">
            {user.balance.toLocaleString()}
          </span>
        </div>
        
        <div className="mt-6 text-left relative z-10">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground">Level {user.level}</span>
            <span className="font-mono text-primary">{user.balance} / {nextThreshold}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden border border-border/50">
            <div 
              className="h-full bg-primary transition-all duration-1000 ease-out" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </motion.div>

      <Link href="/mine" className="bg-gradient-to-r from-yellow-500/20 to-amber-600/10 border border-yellow-500/40 p-4 rounded-2xl flex items-center gap-4 hover:border-yellow-400/70 transition-colors">
        <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/40 shrink-0">
          <Pickaxe className="w-6 h-6 text-yellow-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-yellow-300">Mine HP</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{dashboard.user.canMine ? "Ready to mine — tap to earn HP" : "Cooldown active"}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-yellow-400/70 shrink-0" />
      </Link>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/quests" className="bg-card border border-border p-4 rounded-2xl flex flex-col hover:border-primary/50 transition-colors">
          <Trophy className="w-6 h-6 text-secondary mb-2" />
          <h3 className="font-bold">Quests</h3>
          <p className="text-xs text-muted-foreground mt-1">{dashboard.questsCompleted}/{dashboard.questsTotal} completed</p>
        </Link>
        <Link href="/tasks" className="bg-card border border-border p-4 rounded-2xl flex flex-col hover:border-primary/50 transition-colors">
          <CheckSquare className="w-6 h-6 text-primary mb-2" />
          <h3 className="font-bold">Tasks</h3>
          <p className="text-xs text-muted-foreground mt-1">{dashboard.activeTasksCount} available</p>
        </Link>
      </div>

      {dashboard.recentAchievements.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-lg">Recent Unlocks</h2>
            <Link href="/achievements" className="text-primary text-sm flex items-center gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {dashboard.recentAchievements.map(ach => (
              <div key={ach.id} className="bg-card border border-border p-3 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xl border border-primary/30">
                  {ach.icon}
                </div>
                <div>
                  <h4 className="font-bold text-sm">{ach.title}</h4>
                  <p className="text-xs text-muted-foreground">{ach.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Just mocking CheckSquare since it's not exported by lucide-react directly here
import { CheckSquare } from "lucide-react";
