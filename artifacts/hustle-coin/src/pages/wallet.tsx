import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { motion } from "framer-motion";
import { Coins, Pickaxe, Users, Gift, ShieldCheck, Trophy, Zap, TrendingUp, Bell, Search, X, ChevronDown } from "lucide-react";
import { Link } from "wouter";

type TxType = "mine" | "task" | "referral" | "admin" | "bonus" | "achievement" | "quest";
type FilterType = "all" | TxType;

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  description: string;
  date: string;
  balanceBefore?: number;
  balanceAfter?: number;
}

interface WalletData {
  balance: number;
  level: number;
  totalEarned: number;
  totalSpent: number;
  miningEarnings: number;
  referralEarnings: number;
  taskEarnings: number;
  bonusEarnings: number;
  achievementEarnings: number;
  questEarnings: number;
  adminEarnings: number;
  transactions: Transaction[];
}

const txIcons: Record<TxType, React.ReactNode> = {
  mine: <Pickaxe className="w-4 h-4" />,
  task: <ShieldCheck className="w-4 h-4" />,
  referral: <Users className="w-4 h-4" />,
  admin: <Coins className="w-4 h-4" />,
  bonus: <Gift className="w-4 h-4" />,
  achievement: <Trophy className="w-4 h-4" />,
  quest: <Zap className="w-4 h-4" />,
};

const txColors: Record<TxType, string> = {
  mine: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  task: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  referral: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  admin: "text-green-400 bg-green-400/10 border-green-400/20",
  bonus: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  achievement: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  quest: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
};

const filters: { label: string; value: FilterType; icon: React.ReactNode }[] = [
  { label: "All", value: "all", icon: <TrendingUp className="w-3 h-3" /> },
  { label: "Mining", value: "mine", icon: <Pickaxe className="w-3 h-3" /> },
  { label: "Tasks", value: "task", icon: <ShieldCheck className="w-3 h-3" /> },
  { label: "Referrals", value: "referral", icon: <Users className="w-3 h-3" /> },
  { label: "Bonus", value: "bonus", icon: <Gift className="w-3 h-3" /> },
  { label: "Admin", value: "admin", icon: <Coins className="w-3 h-3" /> },
];

const PAGE_SIZE = 30;

export default function Wallet() {
  const { telegramId } = useTelegram();
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!telegramId) return;
    setLoading(true);
    fetch(`/api/wallet?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json())
      .then(d => { setWalletData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [telegramId]);

  const allTx = walletData?.transactions ?? [];
  const filtered = allTx.filter(t => {
    const typeMatch = filter === "all" || t.type === filter;
    const searchMatch = !search || t.description.toLowerCase().includes(search.toLowerCase());
    return typeMatch && searchMatch;
  });
  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);

  const stats = [
    { label: "Mining", value: walletData?.miningEarnings ?? 0, color: "text-amber-400", icon: <Pickaxe className="w-4 h-4" />, bg: "bg-amber-400/10" },
    { label: "Referrals", value: walletData?.referralEarnings ?? 0, color: "text-purple-400", icon: <Users className="w-4 h-4" />, bg: "bg-purple-400/10" },
    { label: "Tasks", value: walletData?.taskEarnings ?? 0, color: "text-blue-400", icon: <ShieldCheck className="w-4 h-4" />, bg: "bg-blue-400/10" },
    { label: "Bonuses", value: (walletData?.bonusEarnings ?? 0) + (walletData?.achievementEarnings ?? 0) + (walletData?.questEarnings ?? 0), color: "text-pink-400", icon: <Gift className="w-4 h-4" />, bg: "bg-pink-400/10" },
    { label: "Admin", value: walletData?.adminEarnings ?? 0, color: "text-green-400", icon: <Coins className="w-4 h-4" />, bg: "bg-green-400/10" },
    { label: "Spent", value: walletData?.totalSpent ?? 0, color: "text-red-400", icon: <TrendingUp className="w-4 h-4" />, bg: "bg-red-400/10" },
  ];

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
          <p className="text-muted-foreground text-sm">Your HC balance & earnings</p>
        </div>
        <Link href="/notifications" className="relative p-2 rounded-xl bg-card border border-border hover:bg-muted transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </Link>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-primary/20 via-card to-card border border-primary/30 rounded-2xl p-6 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-primary/5 blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Total Balance</p>
          <div className="flex items-center justify-center gap-3">
            <Coins className="w-8 h-8 text-primary" />
            <span className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/60">
              {(walletData?.balance ?? 0).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Total earned: <span className="text-primary font-bold">{(walletData?.totalEarned ?? 0).toLocaleString()} HC</span>
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-xl p-3 text-center"
          >
            <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center mx-auto mb-1.5 ${s.color}`}>
              {s.icon}
            </div>
            <div className={`text-base font-black ${s.color}`}>{s.value.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { setSearch(searchInput); setShowAll(false); } }}
          placeholder="Search transactions..."
          className="w-full bg-card border border-border rounded-xl pl-9 pr-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        {searchInput && (
          <button onClick={() => { setSearchInput(""); setSearch(""); setShowAll(false); }} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Type Filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {filters.map(f => (
          <button
            key={f.value}
            onClick={() => { setFilter(f.value); setShowAll(false); }}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {f.icon}{f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Coins className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-bold">No transactions found</h3>
          <p className="text-muted-foreground text-sm mt-1">
            {search ? "Try a different search term" : "Start mining to earn HC"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visible.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.2) }}
                className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
              >
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${txColors[tx.type]}`}>
                  {txIcons[tx.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    {tx.balanceAfter !== undefined && (
                      <span className="text-[10px] text-muted-foreground/60">→ {tx.balanceAfter.toLocaleString()} HC</span>
                    )}
                  </div>
                </div>
                <div className={`text-sm font-black shrink-0 ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString()} HC
                </div>
              </motion.div>
            ))}
          </div>
          {!showAll && filtered.length > PAGE_SIZE && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
            >
              <ChevronDown className="w-4 h-4" />
              Show all {filtered.length} transactions
            </button>
          )}
          <p className="text-center text-xs text-muted-foreground pb-2">
            Showing {visible.length} of {filtered.length} transactions
          </p>
        </>
      )}
    </div>
  );
}
