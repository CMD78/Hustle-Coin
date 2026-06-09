import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetProfile, useGetMineHistory, useGetReferrals } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Coins, Pickaxe, Users, Gift, ShieldCheck } from "lucide-react";

type TxType = "mine" | "task" | "referral" | "admin" | "bonus";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  description: string;
  date: string;
}

const txIcons: Record<TxType, React.ReactNode> = {
  mine: <Pickaxe className="w-4 h-4" />,
  task: <ShieldCheck className="w-4 h-4" />,
  referral: <Users className="w-4 h-4" />,
  admin: <Coins className="w-4 h-4" />,
  bonus: <Gift className="w-4 h-4" />,
};

const txColors: Record<TxType, string> = {
  mine: "text-amber-400 bg-amber-400/10",
  task: "text-blue-400 bg-blue-400/10",
  referral: "text-purple-400 bg-purple-400/10",
  admin: "text-green-400 bg-green-400/10",
  bonus: "text-pink-400 bg-pink-400/10",
};

type FilterType = "all" | TxType;

export default function Wallet() {
  const { telegramId } = useTelegram();
  const [filter, setFilter] = useState<FilterType>("all");
  const [walletData, setWalletData] = useState<{ balance: number; totalEarned: number; transactions: Transaction[] } | null>(null);

  const { data: profile } = useGetProfile(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  useEffect(() => {
    if (!telegramId) return;
    fetch(`/api/wallet?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json())
      .then(setWalletData)
      .catch(() => {});
  }, [telegramId]);

  const transactions = walletData?.transactions ?? [];
  const filtered = filter === "all" ? transactions : transactions.filter(t => t.type === filter);

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Mining", value: "mine" },
    { label: "Tasks", value: "task" },
    { label: "Referrals", value: "referral" },
    { label: "Bonus", value: "bonus" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-muted-foreground text-sm mt-1">Your HC coin balance & history</p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-card via-card/90 to-card/50 border border-primary/20 rounded-2xl p-6 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-primary/5 blur-3xl" />
        <div className="relative z-10">
          <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
          <div className="flex items-center justify-center gap-3">
            <Coins className="w-8 h-8 text-primary" />
            <span className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">
              {(profile?.balance ?? 0).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Total earned: <span className="text-primary font-bold">{(walletData?.totalEarned ?? 0).toLocaleString()} HC</span>
          </p>
        </div>
      </motion.div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Coins className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-bold text-lg">No transactions yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Start mining to earn HC coins</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((tx, i) => (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
            className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${txColors[tx.type]}`}>
              {txIcons[tx.type]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tx.description}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            <div className="text-sm font-black text-green-400 shrink-0">
              +{tx.amount} HC
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
