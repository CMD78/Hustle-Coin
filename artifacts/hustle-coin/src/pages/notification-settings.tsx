import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { Bell, Pickaxe, CheckSquare, Users, Trophy, Megaphone, BarChart2, Save } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  miningReminder: boolean;
  taskReminder: boolean;
  referralRewards: boolean;
  challengeAlerts: boolean;
  achievementAlerts: boolean;
  announcements: boolean;
  weeklySummary: boolean;
}

const options: { key: keyof Settings; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { key: "referralRewards", label: "Referral Rewards", desc: "When someone uses your referral link", icon: <Users className="w-4 h-4" />, color: "text-purple-400" },
  { key: "achievementAlerts", label: "Achievements", desc: "When you unlock a new achievement", icon: <Trophy className="w-4 h-4" />, color: "text-yellow-400" },
  { key: "taskReminder", label: "Task Updates", desc: "When a task is approved or new tasks added", icon: <CheckSquare className="w-4 h-4" />, color: "text-blue-400" },
  { key: "miningReminder", label: "Mining Ready", desc: "When your mining cooldown expires", icon: <Pickaxe className="w-4 h-4" />, color: "text-amber-400" },
  { key: "challengeAlerts", label: "Challenge Alerts", desc: "Challenge start and winner announcements", icon: <BarChart2 className="w-4 h-4" />, color: "text-green-400" },
  { key: "announcements", label: "Announcements", desc: "Admin announcements and important updates", icon: <Megaphone className="w-4 h-4" />, color: "text-blue-400" },
  { key: "weeklySummary", label: "Weekly Summary", desc: "Your earnings summary every Sunday", icon: <BarChart2 className="w-4 h-4" />, color: "text-pink-400" },
];

export default function NotificationSettings() {
  const { telegramId } = useTelegram();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>({
    miningReminder: true,
    taskReminder: true,
    referralRewards: true,
    challengeAlerts: true,
    achievementAlerts: true,
    announcements: true,
    weeklySummary: false,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!telegramId) return;
    fetch(`/api/notifications/settings?telegramId=${encodeURIComponent(telegramId)}`)
      .then(r => r.json())
      .then(d => { setSettings(d); setDirty(false); })
      .catch(() => {});
  }, [telegramId]);

  const toggle = (key: keyof Settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, ...settings }),
      });
      if (r.ok) {
        setDirty(false);
        toast({ title: "Notification preferences saved!" });
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Notification Settings</h1>
            <p className="text-xs text-muted-foreground">Choose what you hear about</p>
          </div>
        </div>
        <Link href="/notifications" className="text-xs text-muted-foreground hover:text-foreground">← Back</Link>
      </div>

      <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
        {options.map(opt => (
          <div key={opt.key} className="flex items-center gap-3 p-4">
            <div className={`w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0 ${opt.color}`}>
              {opt.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
            <button
              onClick={() => toggle(opt.key)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings[opt.key] ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings[opt.key] ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors hover:bg-primary/90"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : dirty ? "Save Preferences" : "Up to date"}
      </button>
    </div>
  );
}
