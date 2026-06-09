import { useState } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Trophy, Coins, Users, Flame } from "lucide-react";

type LeaderboardType = "hp" | "referrals" | "streak" | "mining";

const tabs: { label: string; value: LeaderboardType; icon: React.ReactNode; unit: string }[] = [
  { label: "Balance", value: "hp", icon: <Coins className="w-4 h-4" />, unit: "HC" },
  { label: "Referrals", value: "referrals", icon: <Users className="w-4 h-4" />, unit: "refs" },
  { label: "Streak", value: "streak", icon: <Flame className="w-4 h-4" />, unit: "days" },
];

const rankColors = ["text-yellow-400", "text-slate-300", "text-amber-700"];
const rankBg = ["bg-yellow-400/10 border-yellow-400/30", "bg-slate-300/10 border-slate-300/30", "bg-amber-700/10 border-amber-700/30"];

export default function Leaderboard() {
  const { telegramId } = useTelegram();
  const [activeTab, setActiveTab] = useState<LeaderboardType>("hp");

  const { data: entries, isLoading } = useGetLeaderboard(
    { type: activeTab, limit: 50 },
    { query: { refetchOnMount: true } as any }
  );

  const myRank = entries?.findIndex(e => e.telegramId === telegramId);
  const myEntry = myRank !== undefined && myRank >= 0 ? entries?.[myRank] : null;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Top HustleCoin earners</p>
        </div>
        <Trophy className="w-7 h-7 text-primary" />
      </div>

      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              activeTab === tab.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {myEntry && (myRank ?? -1) >= 3 && (
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-black text-primary text-sm">
            #{(myRank ?? 0) + 1}
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm">Your rank</div>
            <div className="text-xs text-muted-foreground">@{myEntry.username}</div>
          </div>
          <div className="font-black text-primary text-sm">
            {myEntry.value.toLocaleString()} {tabs.find(t => t.value === activeTab)?.unit}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-muted rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {entries?.map((entry, i) => {
            const isMe = entry.telegramId === telegramId;
            const isTop3 = i < 3;
            const unit = tabs.find(t => t.value === activeTab)?.unit ?? "";

            return (
              <motion.div
                key={entry.telegramId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                  isMe
                    ? "bg-primary/10 border-primary/40"
                    : isTop3
                    ? `${rankBg[i]} border`
                    : "bg-card border-border"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
                  isTop3 ? rankColors[i] : isMe ? "text-primary" : "text-muted-foreground"
                }`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${entry.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm ${isMe ? "text-primary" : ""} truncate`}>
                    {entry.firstName} {isMe ? "(You)" : ""}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">@{entry.username}</div>
                </div>
                <div className={`font-black text-sm shrink-0 ${isTop3 ? rankColors[i] : isMe ? "text-primary" : "text-foreground"}`}>
                  {entry.value.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {!isLoading && (entries?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-bold text-lg">No entries yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Be the first to mine HC!</p>
        </div>
      )}
    </div>
  );
}
