import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useGetAdminStats, useGetAdminUsers, useGrantHp, useCreateTask, useUpdateTask, useBroadcastMessage, useGetAdminFeedback, useGetTasks } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Users, Coins, Pickaxe, TrendingUp, Search, Ban, CheckCircle2, Plus, Send, Lock, RefreshCw, Shield, Zap, Download, Bot, Megaphone, Trash2, Pin, Settings, Clock, Gift } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const ADMIN_ID = "7035629762";

interface TaskCompletion {
  id: number;
  taskId: number;
  taskTitle: string;
  taskReward: number;
  taskType?: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  approved: boolean;
  completedAt: string;
}

function ExistingTasksList({ telegramId }: { telegramId: string }) {
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading, refetch } = useGetTasks(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  const toggleType = (taskId: number, currentType: string) => {
    const newType = currentType === "automatic" ? "manual" : "automatic";
    updateTask.mutate(
      { taskId, data: { taskType: newType as "automatic" | "manual", adminTelegramId: ADMIN_ID } },
      {
        onSuccess: () => {
          toast({ title: `Task set to ${newType}`, description: newType === "automatic" ? "Rewards granted instantly." : "Requires manual approval." });
          refetch();
        },
        onError: () => toast({ title: "Error updating task", variant: "destructive" }),
      }
    );
  };

  const toggleStatus = (taskId: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    updateTask.mutate(
      { taskId, data: { status: newStatus as "active" | "inactive", adminTelegramId: ADMIN_ID } },
      {
        onSuccess: () => { toast({ title: `Task ${newStatus}` }); refetch(); },
        onError: () => toast({ title: "Error updating task", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="bg-card border border-border rounded-2xl p-4 text-center text-sm text-muted-foreground">Loading tasks...</div>;

  const all = tasks ?? [];
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Existing Tasks ({all.length})</h3>
        <button onClick={() => refetch()} className="p-1.5 hover:bg-muted rounded-lg"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>
      {all.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-4">No tasks yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {all.map(t => (
            <div key={t.id} className={`flex items-center gap-2 rounded-xl p-2.5 border ${t.status === "inactive" ? "opacity-50 border-border" : t.taskType === "automatic" ? "border-green-500/20 bg-green-500/5" : "border-border bg-muted/30"}`}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">+{t.reward} HC · {t.taskType === "automatic" ? "⚡ Instant" : "🔒 Manual"}</p>
              </div>
              <button
                onClick={() => toggleType(t.id, t.taskType)}
                disabled={updateTask.isPending}
                title={`Switch to ${t.taskType === "automatic" ? "manual" : "automatic"}`}
                className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${t.taskType === "automatic" ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" : "bg-muted text-muted-foreground border-border hover:border-primary/50"}`}
              >
                {t.taskType === "automatic" ? "⚡ Auto" : "🔒 Manual"}
              </button>
              <button
                onClick={() => toggleStatus(t.id, t.status)}
                disabled={updateTask.isPending}
                className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${t.status === "active" ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"}`}
              >
                {t.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCompletions({ telegramId }: { telegramId: string }) {
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/task-completions?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json()).then(setCompletions).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [telegramId]);

  const handleApprove = async (taskId: number, userTelegramId: string, reward: number) => {
    setApproving(taskId);
    try {
      const r = await fetch(`/api/admin/tasks/${taskId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminTelegramId: telegramId, telegramId: userTelegramId }),
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      toast({ title: "Approved!", description: `+${reward} HC granted to ${userTelegramId}` });
      load();
    } finally {
      setApproving(null);
    }
  };

  const pending = completions.filter(c => !c.approved);
  const approved = completions.filter(c => c.approved);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Task Submissions</h3>
        <div className="flex items-center gap-2">
          {pending.length > 0 && <span className="text-xs bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full">{pending.length} pending</span>}
          <button onClick={load} className="p-1.5 hover:bg-muted rounded-lg"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : completions.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-6">No task submissions yet</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {pending.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-muted/50 border border-amber-500/20 rounded-xl p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{c.taskTitle} <span className="text-amber-400">+{c.taskReward} HC</span></p>
                <p className="text-[10px] text-muted-foreground">{c.firstName}{c.username ? ` @${c.username}` : ""} · {new Date(c.completedAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleApprove(c.taskId, c.telegramId, c.taskReward)}
                disabled={approving === c.taskId}
                className="shrink-0 px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-bold hover:bg-green-500/30 transition-colors disabled:opacity-50"
              >
                {approving === c.taskId ? "..." : "Approve"}
              </button>
            </div>
          ))}
          {approved.length > 0 && (
            <details className="text-xs text-muted-foreground cursor-pointer">
              <summary className="py-1 select-none">{approved.length} already approved</summary>
              <div className="space-y-1 mt-1">
                {approved.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-muted/30 rounded-xl p-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span className="truncate">{c.taskTitle} · {c.firstName}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

type Tab = "dashboard" | "users" | "tasks" | "broadcast" | "recent" | "telegram" | "announce" | "deploy";

interface Announcement {
  id: number;
  message: string;
  type: string;
  isPinned: boolean;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function Admin() {
  const { telegramId } = useTelegram();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [grantTarget, setGrantTarget] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [newTask, setNewTask] = useState({ title: "", description: "", reward: "", link: "", taskType: "manual" as "automatic" | "manual" });
  const [deployResults, setDeployResults] = useState<Record<string, { status: string; detail: string }> | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [recentActivity, setRecentActivity] = useState<any | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<any | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ message: "", type: "broadcast", isPinned: false, scheduledFor: "" });
  const [launchReadiness, setLaunchReadiness] = useState<number | null>(null);

  const isAdmin = telegramId === ADMIN_ID;
  const { data: stats } = useGetAdminStats({ telegramId }, { query: { enabled: isAdmin } as any });
  const { data: users } = useGetAdminUsers({ telegramId, limit: 100, offset: 0 }, { query: { enabled: isAdmin } as any });
  const { data: feedbackList } = useGetAdminFeedback({ telegramId }, { query: { enabled: isAdmin && tab === "dashboard" } as any });
  const grantHp = useGrantHp();
  const createTask = useCreateTask();
  const broadcast = useBroadcastMessage();

  useEffect(() => {
    if (!isAdmin || tab !== "recent") return;
    fetch(`/api/admin/recent-activity?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json()).then(setRecentActivity).catch(() => {});
  }, [isAdmin, tab, telegramId]);

  useEffect(() => {
    if (!isAdmin || tab !== "telegram") return;
    fetch("/api/telegram-status").then(r => r.json()).then(setTelegramStatus).catch(() => {});
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin || tab !== "announce") return;
    fetch(`/api/admin/announcements?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json()).then(setAnnouncements).catch(() => {});
  }, [isAdmin, tab, telegramId]);

  useEffect(() => {
    if (!isAdmin || tab !== "dashboard") return;
    fetch(`/api/admin/deploy-check?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json())
      .then(data => {
        const checks = Object.values(data.checks ?? {}) as { status: string }[];
        const pct = checks.length ? Math.round((checks.filter(c => c.status === "PASS").length / checks.length) * 100) : 0;
        setLaunchReadiness(pct);
      }).catch(() => {});
  }, [isAdmin, tab, telegramId]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Lock className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">This panel is for admins only.</p>
      </div>
    );
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const r = await fetch(`/api/admin/users/search?telegramId=${encodeURIComponent(telegramId)}&q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(await r.json());
  };

  const handleBan = async (targetId: string, ban: boolean) => {
    await fetch(`/api/admin/users/${targetId}/${ban ? "ban" : "unban"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminTelegramId: telegramId, reason: "Admin action" }),
    });
    toast({ title: ban ? "User banned" : "User unbanned" });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  };

  const handleGrantHp = () => {
    if (!grantTarget || !grantAmount) return;
    grantHp.mutate(
      { data: { targetTelegramId: grantTarget, amount: parseInt(grantAmount), reason: grantReason || "Admin grant", adminTelegramId: telegramId } },
      { onSuccess: () => { toast({ title: "HP granted!" }); setGrantTarget(""); setGrantAmount(""); setGrantReason(""); } }
    );
  };

  const handleCreateTask = () => {
    if (!newTask.title || !newTask.reward) return;
    createTask.mutate(
      { data: { title: newTask.title, description: newTask.description, reward: parseInt(newTask.reward), link: newTask.link || null, taskType: newTask.taskType, adminTelegramId: telegramId } },
      { onSuccess: () => { toast({ title: "Task created!", description: `Created as ${newTask.taskType} task.` }); setNewTask({ title: "", description: "", reward: "", link: "", taskType: "manual" }); } }
    );
  };

  const handleBroadcast = () => {
    if (!broadcastMsg.trim()) return;
    broadcast.mutate(
      { data: { message: broadcastMsg, adminTelegramId: telegramId } },
      { onSuccess: () => { toast({ title: "Broadcast logged!" }); setBroadcastMsg(""); } }
    );
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.message.trim()) return;
    const r = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, ...newAnnouncement, scheduledFor: newAnnouncement.scheduledFor || null }),
    });
    if (r.ok) {
      const created = await r.json();
      setAnnouncements(prev => [created, ...prev]);
      setNewAnnouncement({ message: "", type: "broadcast", isPinned: false, scheduledFor: "" });
      toast({ title: "Announcement created!" });
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    await fetch(`/api/admin/announcements/${id}?telegramId=${encodeURIComponent(telegramId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId }),
    });
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    toast({ title: "Announcement deleted" });
  };

  const handleDeployCheck = async () => {
    setDeployLoading(true);
    const r = await fetch(`/api/admin/deploy-check?telegramId=${encodeURIComponent(telegramId)}`);
    const data = await r.json();
    setDeployResults(data.checks);
    const pct = Math.round((Object.values(data.checks).filter((c: any) => c.status === "PASS").length / Object.values(data.checks).length) * 100);
    setLaunchReadiness(pct);
    setDeployLoading(false);
  };

  const handleExportCSV = () => {
    if (!users?.length) return;
    const headers = ["ID", "TelegramID", "Username", "First Name", "Balance", "Level", "Streak", "Total Mines", "Referrals", "Join Date", "Banned"];
    const rows = users.map(u => [u.id, u.telegramId, u.username, u.firstName, u.balance, u.level, u.streak, u.totalMines, u.referralCount, u.joinDate, (u as any).isBanned].join(","));
    downloadCSV([headers.join(","), ...rows].join("\n"), `hustlecoin-users-${today()}.csv`);
    toast({ title: `Exported ${users.length} users` });
  };

  const handleExportReferrals = () => {
    window.open(`/api/admin/export/referrals?telegramId=${encodeURIComponent(telegramId)}`, "_blank");
    toast({ title: "Downloading referrals CSV..." });
  };

  const handleExportTransactions = () => {
    window.open(`/api/admin/export/transactions?telegramId=${encodeURIComponent(telegramId)}`, "_blank");
    toast({ title: "Downloading transactions CSV..." });
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const today = () => new Date().toISOString().split("T")[0];

  const navTabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Stats" },
    { id: "users", label: "Users" },
    { id: "tasks", label: "Tasks" },
    { id: "announce", label: "Announce" },
    { id: "broadcast", label: "Send" },
    { id: "recent", label: "Recent" },
    { id: "telegram", label: "Bot" },
    { id: "deploy", label: "Deploy" },
  ];

  const displayUsers = searchResults ?? users ?? [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">HustleCoin Beta v1.0</p>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {navTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              tab === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && stats && (
        <div className="space-y-4">
          {launchReadiness !== null && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold">Launch Readiness</span>
                <span className={`text-lg font-black ${launchReadiness >= 80 ? "text-green-400" : launchReadiness >= 50 ? "text-amber-400" : "text-red-400"}`}>
                  {launchReadiness}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${launchReadiness >= 80 ? "bg-green-500" : launchReadiness >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${launchReadiness}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <Users className="w-4 h-4" />, label: "Total Users", value: stats.totalUsers, color: "text-blue-400" },
              { icon: <TrendingUp className="w-4 h-4" />, label: "New Today", value: stats.newUsersToday, color: "text-green-400" },
              { icon: <Coins className="w-4 h-4" />, label: "Total HC", value: stats.totalCoins ?? 0, color: "text-primary" },
              { icon: <Pickaxe className="w-4 h-4" />, label: "Total Mines", value: stats.totalMines, color: "text-amber-400" },
              { icon: <Users className="w-4 h-4" />, label: "Referrals", value: stats.totalReferrals, color: "text-purple-400" },
              { icon: <Zap className="w-4 h-4" />, label: "Active Today", value: stats.activeUsersToday, color: "text-secondary" },
              { icon: <Clock className="w-4 h-4" />, label: "Pending Tasks", value: stats.pendingTasks ?? 0, color: "text-yellow-400" },
              { icon: <Gift className="w-4 h-4" />, label: "Task Rewards Out", value: stats.taskRewardsOut ?? 0, color: "text-pink-400" },
              { icon: <Zap className="w-4 h-4" />, label: "Auto Tasks", value: stats.automaticTasksCount ?? 0, color: "text-green-400" },
              { icon: <Settings className="w-4 h-4" />, label: "Manual Tasks", value: stats.manualTasksCount ?? 0, color: "text-blue-300" },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-2xl p-3 text-center"
              >
                <div className={`flex justify-center mb-1 ${s.color}`}>{s.icon}</div>
                <div className={`font-black text-xl ${s.color}`}>{s.value.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm">Grant HC</h3>
            <input value={grantTarget} onChange={e => setGrantTarget(e.target.value)} placeholder="Telegram ID" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <input value={grantAmount} onChange={e => setGrantAmount(e.target.value)} placeholder="Amount (neg to remove)" type="number" className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
              <button onClick={handleGrantHp} disabled={grantHp.isPending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                Grant
              </button>
            </div>
            <input value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="Reason (optional)" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
          </div>

          {(feedbackList?.length ?? 0) > 0 && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <h3 className="font-bold text-sm">Recent Feedback ({feedbackList?.length})</h3>
              {feedbackList?.slice(0, 3).map(f => (
                <div key={f.id} className="bg-muted rounded-xl p-3 text-sm">
                  <p className="font-medium">{f.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(f.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search name, username or ID"
              className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm"
            />
            <button onClick={handleSearch} className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center">
              <Search className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleExportCSV} disabled={!users?.length} className="flex items-center justify-center gap-1.5 py-2.5 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-colors">
              <Download className="w-3.5 h-3.5" /> Users
            </button>
            <button onClick={handleExportReferrals} className="flex items-center justify-center gap-1.5 py-2.5 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-colors">
              <Download className="w-3.5 h-3.5" /> Referrals
            </button>
            <button onClick={handleExportTransactions} className="flex items-center justify-center gap-1.5 py-2.5 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-colors">
              <Download className="w-3.5 h-3.5" /> Transactions
            </button>
          </div>

          {displayUsers.map((u: any) => (
            <div key={u.telegramId} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-black text-primary text-sm shrink-0">
                {u.firstName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{u.firstName} <span className="text-xs text-muted-foreground">@{u.username}</span></div>
                <div className="text-xs text-muted-foreground">{u.balance?.toLocaleString()} HC · Lvl {u.level} · {u.referralCount} refs</div>
                {(u as any).isBanned && <span className="text-xs text-red-400 font-semibold">BANNED</span>}
              </div>
              <button
                onClick={() => handleBan(u.telegramId, !(u as any).isBanned)}
                className={`p-2 rounded-xl ${(u as any).isBanned ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}
              >
                {(u as any).isBanned ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <TaskCompletions telegramId={telegramId} />
          <ExistingTasksList telegramId={telegramId} />
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Create Task</h3>
            <input value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
            <input value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} placeholder="Description" className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <input value={newTask.reward} onChange={e => setNewTask({ ...newTask, reward: e.target.value })} placeholder="HC Reward" type="number" className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
              <input value={newTask.link} onChange={e => setNewTask({ ...newTask, link: e.target.value })} placeholder="Link (optional)" className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setNewTask({ ...newTask, taskType: "manual" })}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${newTask.taskType === "manual" ? "bg-muted border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                🔒 Manual Approval
              </button>
              <button
                onClick={() => setNewTask({ ...newTask, taskType: "automatic" })}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${newTask.taskType === "automatic" ? "bg-green-500/20 border-green-500 text-green-400" : "border-border text-muted-foreground hover:border-green-500/50"}`}
              >
                ⚡ Instant Reward
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {newTask.taskType === "automatic" ? "Users receive HC immediately upon completion — no approval needed." : "Users submit for review. You approve and reward manually."}
            </p>
            <button onClick={handleCreateTask} disabled={createTask.isPending} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
              Create Task
            </button>
          </div>
        </div>
      )}

      {tab === "announce" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Megaphone className="w-4 h-4" /> New Announcement</h3>
            <textarea
              value={newAnnouncement.message}
              onChange={e => setNewAnnouncement({ ...newAnnouncement, message: e.target.value })}
              placeholder="Announcement message..."
              rows={3}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <select
                value={newAnnouncement.type}
                onChange={e => setNewAnnouncement({ ...newAnnouncement, type: e.target.value })}
                className="flex-1 bg-muted border border-border rounded-xl px-3 py-2 text-sm"
              >
                <option value="broadcast">Broadcast</option>
                <option value="pinned">Pinned</option>
                <option value="scheduled">Scheduled</option>
              </select>
              <label className="flex items-center gap-2 text-sm px-3 py-2 bg-muted border border-border rounded-xl cursor-pointer">
                <input type="checkbox" checked={newAnnouncement.isPinned} onChange={e => setNewAnnouncement({ ...newAnnouncement, isPinned: e.target.checked })} />
                <Pin className="w-3.5 h-3.5" /> Pin
              </label>
            </div>
            {newAnnouncement.type === "scheduled" && (
              <input
                type="datetime-local"
                value={newAnnouncement.scheduledFor}
                onChange={e => setNewAnnouncement({ ...newAnnouncement, scheduledFor: e.target.value })}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm"
              />
            )}
            <button onClick={handleCreateAnnouncement} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
              Publish Announcement
            </button>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">History ({announcements.length})</h3>
            {announcements.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">No announcements yet</p>
            )}
            {announcements.map(a => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-semibold capitalize">{a.type}</span>
                      {a.isPinned && <Pin className="w-3 h-3 text-amber-400" />}
                    </div>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                  <button onClick={() => handleDeleteAnnouncement(a.id)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "broadcast" && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2"><Send className="w-4 h-4" /> Broadcast Message</h3>
          <textarea
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
            placeholder="Message to all users..."
            rows={4}
            className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm resize-none"
          />
          <button onClick={handleBroadcast} disabled={broadcast.isPending} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors">
            {broadcast.isPending ? "Sending..." : "Send Broadcast"}
          </button>
          <p className="text-xs text-muted-foreground">Broadcasts are logged. Connect Telegram Bot API to deliver to users.</p>
        </div>
      )}

      {tab === "recent" && (
        <div className="space-y-4">
          {!recentActivity ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> Recent Registrations ({recentActivity.recentUsers?.length ?? 0})
                </h3>
                {recentActivity.recentUsers?.map((u: any) => (
                  <div key={u.telegramId} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-black text-primary text-sm shrink-0">
                      {u.firstName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{u.firstName} <span className="text-xs text-muted-foreground">@{u.username}</span></div>
                      <div className="text-xs text-muted-foreground">{new Date(u.joinDate).toLocaleDateString()}</div>
                    </div>
                    <div className="text-xs font-bold text-primary">{u.balance.toLocaleString()} HC</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> Recent Referrals ({recentActivity.recentReferrals?.length ?? 0})
                </h3>
                {recentActivity.recentReferrals?.map((r: any, i: number) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
                    <div className="text-xs font-mono text-muted-foreground">
                      {r.referrerTelegramId.slice(0, 8)}... → {r.refereeTelegramId.slice(0, 8)}...
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-primary font-bold">+{r.referrerHpEarned} HC</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Pickaxe className="w-4 h-4" /> Recent Mining ({recentActivity.recentMines?.length ?? 0})
                </h3>
                {recentActivity.recentMines?.map((m: any, i: number) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground">{m.telegramId.slice(0, 12)}...</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(m.minedAt).toLocaleString()}</div>
                    </div>
                    <div className="text-xs font-bold text-amber-400">+{m.hpEarned + (m.bonusHp ?? 0)} HC</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "telegram" && (
        <div className="space-y-4">
          {!telegramStatus ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {[
                  { label: "Bot Token", ok: telegramStatus.botConfigured, detail: telegramStatus.botConfigured ? "Configured" : "Set TELEGRAM_BOT_TOKEN" },
                  { label: "Bot Username", ok: !!telegramStatus.botUsername, detail: telegramStatus.botUsername ?? "Set BOT_USERNAME" },
                  { label: "Database", ok: telegramStatus.database?.connected, detail: `${telegramStatus.database?.userCount ?? 0} users` },
                  { label: "Rate Limiting", ok: true, detail: "120 req/min global, 10 req/min on sensitive" },
                  { label: "HMAC Verification", ok: true, detail: "Supported via initData" },
                ].map(c => (
                  <div key={c.label} className={`flex items-center gap-3 p-3 rounded-xl border ${c.ok ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${c.ok ? "bg-green-500" : "bg-amber-500"}`} />
                    <div className="flex-1"><p className="text-sm font-medium">{c.label}</p><p className="text-xs text-muted-foreground">{c.detail}</p></div>
                    <span className={`text-xs font-bold ${c.ok ? "text-green-400" : "text-amber-400"}`}>{c.ok ? "PASS" : "WARN"}</span>
                  </div>
                ))}
              </div>

              {telegramStatus.miniAppUrl && (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Mini App URL</p>
                  <p className="font-mono text-sm text-primary break-all">{telegramStatus.miniAppUrl}</p>
                </div>
              )}

              <Link href="/telegram-connect" className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors">
                <Bot className="w-4 h-4" />
                Open Connection Hub →
              </Link>
            </>
          )}
        </div>
      )}

      {tab === "deploy" && (
        <div className="space-y-4">
          <button
            onClick={handleDeployCheck}
            disabled={deployLoading}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${deployLoading ? "animate-spin" : ""}`} />
            {deployLoading ? "Running checks..." : "Run Deploy Check"}
          </button>

          {deployResults && (
            <div className="space-y-2">
              {Object.entries(deployResults).map(([key, result]) => (
                <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border ${result.status === "PASS" ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${result.status === "PASS" ? "bg-green-500" : "bg-red-500"}`} />
                  <div className="flex-1">
                    <div className="font-semibold text-sm capitalize">{key.replace(/_/g, " ")}</div>
                    <div className="text-xs text-muted-foreground">{result.detail}</div>
                  </div>
                  <span className={`text-xs font-bold ${result.status === "PASS" ? "text-green-400" : "text-red-400"}`}>{result.status}</span>
                </div>
              ))}
            </div>
          )}

          <Link href="/admin/settings" className="w-full flex items-center justify-center gap-2 py-3 border border-border rounded-xl text-sm font-semibold hover:bg-muted transition-colors">
            <Settings className="w-4 h-4" />
            Edit Social Links & Settings →
          </Link>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2 text-sm">
            <h3 className="font-bold">System Info</h3>
            {[
              ["Version", "Beta v1.0"],
              ["Mining Reward", "100 HC/day"],
              ["Welcome Bonus", "+250 HC"],
              ["Referrer Bonus", "+500 HC"],
              ["Referee Bonus", "+250 HC"],
              ["Rate Limit", "120/min global"],
              ["Admin ID", ADMIN_ID],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-muted-foreground">
                <span>{label}</span><span className="text-foreground font-mono text-xs">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
