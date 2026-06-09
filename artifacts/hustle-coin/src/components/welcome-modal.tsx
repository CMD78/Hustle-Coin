import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pickaxe, Users, CheckSquare, Trophy, Wallet, CheckCircle, Coins } from "lucide-react";

const WELCOME_KEY = "hc_welcome_v1";

const features = [
  { icon: Pickaxe, label: "Daily Mining", desc: "Mine +100 HC every 24 hours" },
  { icon: Users, label: "Invite Friends", desc: "+500 HC per referral, +250 they get" },
  { icon: CheckSquare, label: "Complete Tasks", desc: "Social tasks for bonus HC" },
  { icon: Trophy, label: "Leaderboard", desc: "Compete globally for top rank" },
  { icon: Wallet, label: "Wallet", desc: "Track all your HC earnings" },
];

export default function WelcomeModal({ bonus = 250 }: { bonus?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(WELCOME_KEY);
    if (!seen) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const dismiss = () => {
    localStorage.setItem(WELCOME_KEY, "1");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[430px] bg-card border-t border-x border-border rounded-t-3xl p-6 pb-12"
          >
            <div className="text-center mb-5">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="text-5xl mb-3"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-black leading-tight">Welcome to HustleCoin!</h2>
              <p className="text-sm text-muted-foreground mt-1">Your journey to earning HC starts now</p>
              {bonus > 0 && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: "spring" }}
                  className="mt-3 inline-flex items-center gap-2 bg-primary/20 border border-primary/40 rounded-full px-4 py-2"
                >
                  <Coins className="w-4 h-4 text-primary" />
                  <span className="text-primary font-bold text-sm">+{bonus} HC Welcome Bonus credited!</span>
                </motion.div>
              )}
            </div>

            <div className="space-y-2.5 mb-6">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className="flex items-center gap-3 p-3 bg-muted/60 rounded-xl"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <f.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                </motion.div>
              ))}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={dismiss}
              className="w-full py-4 bg-gradient-to-r from-primary to-amber-500 text-black rounded-2xl font-black text-lg shadow-lg shadow-primary/30 hover:brightness-110 transition-all"
            >
              Start Earning! ⚡
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
