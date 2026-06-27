import { useState, useEffect, useCallback } from "react";
import { useTelegram } from "@/lib/telegram";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Trash2, ChevronDown, Gift, Pickaxe, Users, Trophy, Coins, Megaphone, Settings } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  relatedEntity: string | null;
  createdAt: string;
}

interface NotifData {
  notifications: Notification[];
  total: number;
  unread: number;
  hasMore: boolean;
}

const typeIcon: Record<string, React.ReactNode> = {
  referral_reward: <Users className="w-4 h-4" />,
  referral_joined: <Users className="w-4 h-4" />,
  achievement_unlocked: <Trophy className="w-4 h-4" />,
  wallet_credit: <Coins className="w-4 h-4" />,
  wallet_adjustment: <Coins className="w-4 h-4" />,
  admin_announcement: <Megaphone className="w-4 h-4" />,
  mining_ready: <Pickaxe className="w-4 h-4" />,
  task_approved: <Gift className="w-4 h-4" />,
};

const typeColor: Record<string, string> = {
  referral_reward: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  referral_joined: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  achievement_unlocked: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  wallet_credit: "text-green-400 bg-green-400/10 border-green-400/20",
  wallet_adjustment: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  admin_announcement: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  mining_ready: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  task_approved: "text-pink-400 bg-pink-400/10 border-pink-400/20",
};

const PAGE_SIZE = 20;

export default function Notifications() {
  const { telegramId } = useTelegram();
  const { toast } = useToast();
  const [data, setData] = useState<NotifData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (off = 0, append = false) => {
    if (!telegramId) return;
    if (off === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const r = await fetch(`/api/notifications?telegramId=${encodeURIComponent(telegramId)}&limit=${PAGE_SIZE}&offset=${off}`);
      const d = await r.json() as NotifData;
      setData(prev => append && prev
        ? { ...d, notifications: [...prev.notifications, ...d.notifications] }
        : d
      );
      setOffset(off + d.notifications.length);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [telegramId]);

  useEffect(() => { load(0); }, [load]);

  const markRead = async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    setData(prev => prev ? {
      ...prev,
      unread: Math.max(0, prev.unread - 1),
      notifications: prev.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    } : prev);
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    setData(prev => prev ? {
      ...prev,
      unread: 0,
      notifications: prev.notifications.map(n => ({ ...n, read: true })),
    } : prev);
    toast({ title: "All notifications marked as read" });
  };

  const deleteNotif = async (id: number, wasUnread: boolean) => {
    await fetch(`/api/notifications/${id}?telegramId=${encodeURIComponent(telegramId)}`, { method: "DELETE" });
    setData(prev => prev ? {
      ...prev,
      total: prev.total - 1,
      unread: wasUnread ? Math.max(0, prev.unread - 1) : prev.unread,
      notifications: prev.notifications.filter(n => n.id !== id),
    } : prev);
  };

  const getIcon = (type: string) => typeIcon[type] ?? <Bell className="w-4 h-4" />;
  const getColor = (type: string) => typeColor[type] ?? "text-primary bg-primary/10 border-primary/20";

  const notifs = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Notifications</h1>
            {unread > 0 && (
              <span className="text-xs font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                {unread} new
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Your activity feed</p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
          <Link href="/notification-settings" className="p-2 rounded-xl hover:bg-muted transition-colors">
            <Settings className="w-4 h-4 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Bell className="w-14 h-14 text-muted-foreground mb-4" />
          <h3 className="font-bold text-lg">No notifications yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Mine, complete tasks, and refer friends to earn rewards</p>
        </div>
      ) : (
        <>
          <AnimatePresence mode="popLayout">
            {notifs.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: Math.min(i * 0.02, 0.15) }}
                className={`bg-card border rounded-xl p-3 flex items-start gap-3 transition-colors ${n.read ? "border-border opacity-80" : "border-primary/30 bg-primary/5"}`}
              >
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${getColor(n.type)}`}>
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold leading-tight ${n.read ? "text-foreground/80" : "text-foreground"}`}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotif(n.id, !n.read)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {data?.hasMore && (
            <button
              onClick={() => load(offset, true)}
              disabled={loadingMore}
              className="w-full py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
            >
              {loadingMore
                ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <><ChevronDown className="w-4 h-4" /> Load more</>
              }
            </button>
          )}

          <p className="text-center text-xs text-muted-foreground pb-2">
            {notifs.length} of {data?.total ?? 0} notifications
          </p>
        </>
      )}
    </div>
  );
}
