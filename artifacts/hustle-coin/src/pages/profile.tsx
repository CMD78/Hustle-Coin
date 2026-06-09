import { useTelegram } from "@/lib/telegram";
import { useGetProfile, useGetAchievements } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Coins, Flame, Trophy, Users, Pickaxe, Star, Calendar, Zap } from "lucide-react";
import { Link } from "wouter";

const LEVEL_THRESHOLDS = [0, 500, 1000, 2500, 5000, 10000, 25000, 50000];

export default function Profile() {
  const { telegramId, user: tgUser } = useTelegram();

  const { data: profile, isLoading } = useGetProfile(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );
  const { data: achievements } = useGetAchievements(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
        <div className="h-24 bg-muted rounded-2xl animate-pulse" />
        <div className="h-32 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!profile) return null;

  const nextThreshold = LEVEL_THRESHOLDS[profile.level] ?? 50000;
  const currentThreshold = LEVEL_THRESHOLDS[profile.level - 1] ?? 0;
  const progress = Math.min(100, ((profile.balance - currentThreshold) / (nextThreshold - currentThreshold)) * 100);
  const unlockedCount = achievements?.filter(a => a.unlocked).length ?? 0;
  const joinDate = new Date(profile.joinDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const stats = [
    { icon: <Coins className="w-4 h-4" />, label: "Balance", value: profile.balance.toLocaleString(), color: "text-primary" },
    { icon: <Zap className="w-4 h-4" />, label: "Level", value: `Lvl ${profile.level}`, color: "text-secondary" },
    { icon: <Flame className="w-4 h-4" />, label: "Streak", value: `${profile.streak}d`, color: "text-orange-400" },
    { icon: <Users className="w-4 h-4" />, label: "Referrals", value: String(profile.referralCount), color: "text-purple-400" },
    { icon: <Pickaxe className="w-4 h-4" />, label: "Mines", value: String(profile.totalMines), color: "text-blue-400" },
    { icon: <Trophy className="w-4 h-4" />, label: "Achievements", value: String(unlockedCount), color: "text-yellow-400" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-card to-card/50 border border-border rounded-2xl p-6 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-primary/3 blur-3xl" />
        <div className="relative z-10">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center mx-auto mb-3 text-3xl font-black text-black shadow-lg shadow-primary/30">
            {profile.firstName.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-black">{profile.firstName} {profile.lastName ?? ""}</h2>
          <p className="text-muted-foreground text-sm">@{profile.username}</p>
          <p className="text-xs text-muted-foreground mt-1">ID: {profile.telegramId}</p>

          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Level {profile.level}</span>
              <span className="text-primary font-mono">{profile.balance}/{nextThreshold} HC</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-2xl p-3 text-center"
          >
            <div className={`flex justify-center mb-1 ${stat.color}`}>{stat.icon}</div>
            <div className={`font-black text-lg ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-muted-foreground">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
        <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Member since</p>
          <p className="font-semibold text-sm">{joinDate}</p>
        </div>
      </div>

      {(profile.badges?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Badges</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.badges?.map((badge, i) => (
              <span key={i} className="text-xs bg-primary/10 border border-primary/30 text-primary px-2.5 py-1 rounded-full font-medium">
                {badge}
              </span>
            ))}
          </div>
        </div>
      )}

      {unlockedCount > 0 && (
        <Link href="/achievements" className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="font-bold text-sm">Achievements</p>
              <p className="text-xs text-muted-foreground">{unlockedCount} unlocked</p>
            </div>
          </div>
          <span className="text-muted-foreground text-sm">→</span>
        </Link>
      )}

      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground/40">HustleCoin Beta v1.0</p>
      </div>
    </div>
  );
}
