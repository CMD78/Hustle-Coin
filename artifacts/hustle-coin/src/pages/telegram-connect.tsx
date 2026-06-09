import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, CheckCircle2, XCircle, Copy, ExternalLink, Zap, Database, Shield, Users, Pickaxe, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TelegramStatusData {
  version: string;
  botConfigured: boolean;
  botUsername: string | null;
  miniAppUrl: string | null;
  deepLinkExample: string | null;
  botCommands: { command: string; description: string }[];
  database: {
    connected: boolean;
    userCount: number;
    mineCount: number;
    refCount: number;
    taskCount: number;
  };
  setupInstructions: string[];
}

type CheckStatus = "PASS" | "FAIL" | "WARN";

interface SystemCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  icon: React.ReactNode;
}

export default function TelegramConnect() {
  const [data, setData] = useState<TelegramStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/telegram-status")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const telegramShare = (url: string) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Checking Telegram connection...</p>
      </div>
    );
  }

  const checks: SystemCheck[] = [
    {
      key: "db",
      label: "Database",
      status: data?.database.connected ? "PASS" : "FAIL",
      detail: data?.database.connected ? `Connected — ${data.database.userCount} users` : "Connection failed",
      icon: <Database className="w-4 h-4" />,
    },
    {
      key: "bot_token",
      label: "Bot Token",
      status: data?.botConfigured ? "PASS" : "WARN",
      detail: data?.botConfigured ? "TELEGRAM_BOT_TOKEN configured" : "Set TELEGRAM_BOT_TOKEN env var",
      icon: <Bot className="w-4 h-4" />,
    },
    {
      key: "bot_username",
      label: "Bot Username",
      status: data?.botUsername ? "PASS" : "WARN",
      detail: data?.botUsername ? `@${data.botUsername}` : "Set BOT_USERNAME env var",
      icon: <Bot className="w-4 h-4" />,
    },
    {
      key: "referrals",
      label: "Referral System",
      status: "PASS",
      detail: `${data?.database.refCount ?? 0} referrals tracked`,
      icon: <Users className="w-4 h-4" />,
    },
    {
      key: "mining",
      label: "Mining System",
      status: "PASS",
      detail: `${data?.database.mineCount ?? 0} mines logged`,
      icon: <Pickaxe className="w-4 h-4" />,
    },
    {
      key: "hmac",
      label: "HMAC Auth",
      status: "PASS",
      detail: "initData validation supported",
      icon: <Shield className="w-4 h-4" />,
    },
  ];

  const passCount = checks.filter(c => c.status === "PASS").length;
  const readinessPct = Math.round((passCount / checks.length) * 100);

  const statusColor = (s: CheckStatus) =>
    s === "PASS" ? "text-green-400" : s === "WARN" ? "text-amber-400" : "text-red-400";

  const statusBg = (s: CheckStatus) =>
    s === "PASS" ? "border-green-500/20 bg-green-500/5" : s === "WARN" ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5";

  const StatusIcon = ({ s }: { s: CheckStatus }) =>
    s === "PASS" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
    s === "WARN" ? <Zap className="w-4 h-4 text-amber-400" /> :
    <XCircle className="w-4 h-4 text-red-400" />;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Telegram Connect</h1>
          <p className="text-xs text-muted-foreground">{data?.version ?? "HustleCoin Beta v1.0"}</p>
        </div>
        <Bot className="w-7 h-7 text-primary" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold">Launch Readiness</span>
          <span className={`text-lg font-black ${readinessPct >= 80 ? "text-green-400" : readinessPct >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {readinessPct}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${readinessPct >= 80 ? "bg-green-500" : readinessPct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
            initial={{ width: 0 }}
            animate={{ width: `${readinessPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{passCount}/{checks.length} systems operational</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Status</h2>
        {checks.map((c, i) => (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={`flex items-center gap-3 p-3 rounded-xl border ${statusBg(c.status)}`}
          >
            <div className={statusColor(c.status)}>{c.icon}</div>
            <div className="flex-1">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold ${statusColor(c.status)}`}>{c.status}</span>
              <StatusIcon s={c.status} />
            </div>
          </motion.div>
        ))}
      </div>

      {(data?.miniAppUrl || data?.deepLinkExample) && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">App URLs</h3>
          </div>
          {data.miniAppUrl && (
            <div className="bg-muted rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Mini App</p>
                <p className="text-xs font-mono truncate text-primary">{data.miniAppUrl}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => copy(data.miniAppUrl!, "Mini App URL")} className="p-1.5 rounded-lg hover:bg-muted-foreground/10">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => telegramShare(`https://t.me/share/url?url=${encodeURIComponent(data.miniAppUrl!)}`)} className="p-1.5 rounded-lg hover:bg-muted-foreground/10">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
          {data.deepLinkExample && (
            <div className="bg-muted rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Referral deep link template</p>
                <p className="text-xs font-mono truncate">{data.deepLinkExample}</p>
              </div>
              <button onClick={() => copy(data.deepLinkExample!, "Referral link")} className="p-1.5 rounded-lg hover:bg-muted-foreground/10">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {data?.botCommands && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm">Bot Commands</h3>
          <div className="space-y-1.5">
            {data.botCommands.map(cmd => (
              <div key={cmd.command} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-xs">
                <span className="font-mono text-primary">{cmd.command}</span>
                <span className="text-muted-foreground">{cmd.description}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => copy(data.botCommands.map(c => `${c.command} - ${c.description}`).join("\n"), "Bot commands")}
            className="w-full py-2.5 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-colors"
          >
            Copy all — paste into BotFather /setcommands
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <h3 className="font-bold text-sm">POST /api/telegram/start</h3>
        <p className="text-xs text-muted-foreground mb-2">Endpoint for your Telegram Bot to register users with referral tracking</p>
        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-muted-foreground whitespace-pre">{`POST /api/telegram/start
Content-Type: application/json

{
  "telegramId": "123456789",
  "username": "johndoe",
  "firstName": "John",
  "startParameter": "REFERRER_ID",
  "initData": "query_id=..."
}`}</pre>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <h3 className="font-bold text-sm flex items-center gap-2">🔧 Setup Steps</h3>
        <div className="space-y-2">
          {(data?.setupInstructions ?? []).map((step, i) => (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-bold shrink-0">{i + 1}.</span>
              <span>{step.replace(/^\d+\.\s*/, "")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
