import { useState, useEffect } from "react";
import { useTelegram } from "@/lib/telegram";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Lock, ExternalLink } from "lucide-react";
import { Link } from "wouter";

const ADMIN_ID = "7035629762";

interface SettingsMap {
  telegram_channel: string;
  telegram_community: string;
  twitter_url: string;
  tiktok_url: string;
  bot_username: string;
  app_name: string;
  version: string;
  [key: string]: string;
}

const FIELD_LABELS: Record<string, string> = {
  telegram_channel: "Telegram Channel",
  telegram_community: "Telegram Community",
  twitter_url: "X (Twitter)",
  tiktok_url: "TikTok",
  bot_username: "Bot Username",
  app_name: "App Name",
  version: "Version",
};

export default function AdminSettings() {
  const { telegramId } = useTelegram();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<string, string>>({});

  const isAdmin = telegramId === ADMIN_ID;

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Lock className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">Admin only.</p>
        <Link href="/admin" className="mt-4 text-primary text-sm">← Back to Admin</Link>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleChange = (key: string, value: string) => {
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    setDirty(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, updates: dirty }),
      });
      if (r.ok) {
        setDirty({});
        toast({ title: "Settings saved!", description: `${Object.keys(dirty).length} field(s) updated.` });
      } else {
        toast({ title: "Save failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    }
    setSaving(false);
  };

  const socialFields = ["telegram_channel", "telegram_community", "twitter_url", "tiktok_url"];
  const systemFields = ["bot_username", "app_name", "version"];

  const FieldGroup = ({ fields, title }: { fields: string[]; title: string }) => (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{title}</h3>
      {fields.map(key => (
        <div key={key} className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">{FIELD_LABELS[key] ?? key}</label>
          <div className="flex gap-2 items-center">
            <input
              value={settings[key] ?? ""}
              onChange={e => handleChange(key, e.target.value)}
              className={`flex-1 bg-muted border rounded-xl px-3 py-2 text-sm font-mono transition-colors ${
                dirty[key] !== undefined ? "border-primary" : "border-border"
              }`}
              placeholder={`Enter ${FIELD_LABELS[key] ?? key}`}
            />
            {settings[key]?.startsWith("http") && (
              <a href={settings[key]} target="_blank" rel="noopener noreferrer"
                className="p-2 text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          {dirty[key] !== undefined && (
            <p className="text-[10px] text-primary">Modified — unsaved</p>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="text-xs text-muted-foreground">Social links & system config</p>
          </div>
        </div>
        <Link href="/admin" className="text-xs text-muted-foreground hover:text-foreground">← Admin</Link>
      </div>

      {Object.keys(dirty).length > 0 && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length > 1 ? "s" : ""}</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save All"}
          </button>
        </div>
      )}

      <FieldGroup fields={socialFields} title="Social Links" />
      <FieldGroup fields={systemFields} title="System" />

      <button
        onClick={handleSave}
        disabled={saving || Object.keys(dirty).length === 0}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors hover:bg-primary/90"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : Object.keys(dirty).length === 0 ? "No Changes" : `Save ${Object.keys(dirty).length} Change(s)`}
      </button>

      <div className="bg-muted/50 border border-border rounded-xl p-3">
        <p className="text-xs text-muted-foreground">
          Changes to social links are reflected across the entire app immediately after saving — tasks, referrals, onboarding, and all pages that use these links.
        </p>
      </div>
    </div>
  );
}
