import { useState } from "react";
import { useTelegram } from "@/lib/telegram";
import { useSubmitFeedback } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { MessageSquare, Send, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Feedback() {
  const { telegramId } = useTelegram();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitFeedback = useSubmitFeedback();

  const handleSubmit = () => {
    if (!message.trim()) return;
    submitFeedback.mutate(
      { data: { telegramId, message: message.trim() } },
      {
        onSuccess: () => {
          setSubmitted(true);
          setMessage("");
          toast({ title: "Feedback sent!", description: "Thank you for helping improve HustleCoin." });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not send feedback. Try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
        <p className="text-muted-foreground text-sm mt-1">Help us improve HustleCoin</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl p-6 space-y-4"
      >
        {submitted ? (
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="font-bold text-lg">Thanks for your feedback!</h3>
            <p className="text-muted-foreground text-sm mt-2">We'll review it soon and keep improving.</p>
            <button
              onClick={() => setSubmitted(false)}
              className="mt-4 px-4 py-2 text-sm text-primary font-semibold hover:underline"
            >
              Send another message
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-bold">Your Message</h3>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Share your thoughts, bugs, or ideas..."
              rows={5}
              className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button
              onClick={handleSubmit}
              disabled={submitFeedback.isPending || !message.trim()}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {submitFeedback.isPending ? "Sending..." : "Send Feedback"}
            </button>
          </>
        )}
      </motion.div>

      <div className="bg-card border border-border rounded-2xl p-4 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Questions? Join our community for updates and support.
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <a href="https://t.me/HustleCoin_HSL" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary font-semibold hover:underline">📣 Channel</a>
          <a href="https://t.me/HustleCoinHSL" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary font-semibold hover:underline">💬 Community</a>
          <a href="https://x.com/hustlecoin_HSL" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary font-semibold hover:underline">𝕏 Twitter</a>
          <a href="https://www.tiktok.com/@hustlecoin0" target="_blank" rel="noopener noreferrer"
            className="text-xs text-primary font-semibold hover:underline">🎵 TikTok</a>
        </div>
        <p className="text-xs text-muted-foreground">HustleCoin Beta v1.0</p>
      </div>
    </div>
  );
}
