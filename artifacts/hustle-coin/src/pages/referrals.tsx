import { useTelegram } from "@/lib/telegram";
import { useGetReferrals } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Users, Copy, Share2, Coins, CheckCircle, Gift } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Referrals() {
  const { telegramId } = useTelegram();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: referralData, isLoading } = useGetReferrals(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  const handleCopy = () => {
    if (!referralData?.referralLink) return;
    navigator.clipboard.writeText(referralData.referralLink).then(() => {
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it to earn 500 HC per invite" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = () => {
    const link = referralData?.referralLink ?? "";
    const text = `Join HustleCoin and earn 250 HC bonus! Mine daily and climb the leaderboard. ${link}`;
    if ((window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({ title: "HustleCoin", text, url: link });
    } else {
      handleCopy();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
        <div className="h-24 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-muted-foreground text-sm mt-1">Invite friends, earn big rewards</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-primary/20 via-card to-card border border-primary/30 rounded-2xl p-6 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent blur-2xl" />
        <Gift className="w-10 h-10 text-primary mx-auto mb-3 relative z-10" />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className="text-center">
              <div className="text-2xl font-black text-primary">+500</div>
              <div className="text-xs text-muted-foreground">You earn</div>
            </div>
            <div className="text-muted-foreground text-xl">+</div>
            <div className="text-center">
              <div className="text-2xl font-black text-secondary">+250</div>
              <div className="text-xs text-muted-foreground">They earn</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">HC coins per successful referral</p>
        </div>
      </motion.div>

      <div className="space-y-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Your Referral Link</p>
          <div className="bg-muted rounded-xl px-3 py-2.5 text-xs font-mono text-muted-foreground truncate mb-3">
            {referralData?.referralLink ?? `https://t.me/HustleCoinMinerBot?start=${telegramId}`}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
            >
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-primary">{referralData?.totalReferrals ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Total Referrals
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <div className="text-3xl font-black text-primary">{referralData?.totalEarned ?? 0}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Coins className="w-3.5 h-3.5" />
            HC Earned
          </div>
        </div>
      </div>

      {(referralData?.referrals?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Referrals</h2>
          {referralData?.referrals?.map((r, i) => (
            <motion.div
              key={r.telegramId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">
                {r.firstName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.firstName}</div>
                <div className="text-xs text-muted-foreground">@{r.username}</div>
              </div>
              <div className="text-xs text-primary font-bold">+{r.hpEarned} HC</div>
            </motion.div>
          ))}
        </div>
      )}

      {referralData?.totalReferrals === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-bold text-lg">No Referrals Yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Share your link to start earning</p>
        </div>
      )}
    </div>
  );
}
