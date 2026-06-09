import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, CheckCircle2, XCircle, Database, Shield, Link2, Terminal, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TelegramStatusData {
  version: string;
  botConfigured: boolean;
  botUsername: string | null;
  miniAppUrl: string | null;
  deepLinkExample: string | null;
  botCommands: { command: string; description: string }[];
  hmacVerification: string;
  database: {
    connected: boolean;
    userCount: number;
    mineCount: number;
    refCount: number;
    taskCount: number;
    questCount: number;
    achievementCount: number;
  };
  adminId: string;
  setupInstructions: string[];
}

export default function TelegramStatus() {
  const [data, setData] = useState<TelegramStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/telegram-status")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const StatusRow = ({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) => (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${ok ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5"}`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-green-500" : "bg-red-500"}`} />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      }
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded-lg animate-pulse" />
        {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <XCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Could not reach API server</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Telegram Status</h1>
          <p className="text-xs text-muted-foreground">{data.version}</p>
        </div>
        <Bot className="w-7 h-7 text-primary" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connection</h2>
        <StatusRow label="Telegram Bot Token" ok={data.botConfigured} detail={data.botConfigured ? "Configured via env var" : "Set TELEGRAM_BOT_TOKEN"} />
        <StatusRow label="Bot Username" ok={!!data.botUsername} detail={data.botUsername ?? "Set BOT_USERNAME env var"} />
        <StatusRow label="Database" ok={data.database.connected} detail={data.database.connected ? `${data.database.userCount} users in DB` : "Connection failed"} />
        <StatusRow label="HMAC Verification" ok={true} detail={data.hmacVerification} />
        <StatusRow label="Admin ID" ok={true} detail={`Admin: ${data.adminId}`} />
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Database Stats</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Users", v: data.database.userCount },
            { label: "Mines", v: data.database.mineCount },
            { label: "Referrals", v: data.database.refCount },
            { label: "Tasks", v: data.database.taskCount },
            { label: "Quests", v: data.database.questCount },
            { label: "Achievements", v: data.database.achievementCount },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="font-black text-lg text-primary">{s.v}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {data.miniAppUrl && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Mini App URLs</h3>
          </div>
          <div className="space-y-2">
            <div className="bg-muted rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Mini App</p>
                <p className="text-xs font-mono truncate">{data.miniAppUrl}</p>
              </div>
              <button onClick={() => copy(data.miniAppUrl!, "URL")} className="p-1.5 rounded-lg hover:bg-muted-foreground/10">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="bg-muted rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Referral template</p>
                <p className="text-xs font-mono truncate">{data.deepLinkExample}</p>
              </div>
              <button onClick={() => copy(data.deepLinkExample!, "Link")} className="p-1.5 rounded-lg hover:bg-muted-foreground/10">
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">Bot Commands</h3>
        </div>
        <div className="space-y-1.5">
          {data.botCommands.map(cmd => (
            <div key={cmd.command} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-xs">
              <span className="font-mono text-primary">{cmd.command}</span>
              <span className="text-muted-foreground">{cmd.description}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => copy(data.botCommands.map(c => `${c.command} - ${c.description}`).join("\n"), "Commands")}
          className="w-full py-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted transition-colors"
        >
          Copy all commands (paste into BotFather)
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">Setup Instructions</h3>
        </div>
        <div className="space-y-2">
          {data.setupInstructions.map((step, i) => (
            <div key={i} className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-lg">{step}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
