import { useTelegram } from "@/lib/telegram";
import { useGetQuests } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Trophy, Pickaxe, CheckSquare, Users, Coins } from "lucide-react";

const questIcons: Record<string, React.ReactNode> = {
  mine: <Pickaxe className="w-5 h-5" />,
  complete_task: <CheckSquare className="w-5 h-5" />,
  invite_friend: <Users className="w-5 h-5" />,
};

const questColors: Record<string, string> = {
  mine: "text-amber-400",
  complete_task: "text-blue-400",
  invite_friend: "text-purple-400",
};

export default function Quests() {
  const { telegramId } = useTelegram();
  const { data: quests, isLoading } = useGetQuests(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const completedCount = quests?.filter(q => q.completed).length ?? 0;
  const totalCount = quests?.length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Quests</h1>
          <p className="text-muted-foreground text-sm mt-1">Resets every day at midnight UTC</p>
        </div>
        <div className="bg-card border border-border rounded-full px-3 py-1.5 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-secondary" />
          <span className="font-bold text-sm">{completedCount}/{totalCount}</span>
        </div>
      </div>

      <div className="space-y-4">
        {quests?.map((quest, i) => {
          const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
          const color = questColors[quest.questType] ?? "text-primary";
          const icon = questIcons[quest.questType];

          return (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`bg-card border rounded-2xl p-4 transition-all ${quest.completed ? "border-green-500/30 opacity-80" : "border-border hover:border-primary/30"}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-muted ${color} shrink-0`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-sm">{quest.title}</h3>
                    <div className="flex items-center gap-1 text-xs font-bold text-primary shrink-0">
                      <Coins className="w-3 h-3" />
                      +{quest.reward}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{quest.description}</p>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className={quest.completed ? "text-green-400 font-semibold" : "text-muted-foreground"}>
                        {quest.completed ? "✓ Completed!" : `${quest.progress} / ${quest.target}`}
                      </span>
                      <span className="text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${quest.completed ? "bg-green-500" : "bg-primary"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.1 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {completedCount === totalCount && totalCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-br from-primary/20 to-secondary/10 border border-primary/30 rounded-2xl p-6 text-center"
        >
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="font-bold text-lg">All quests done!</h3>
          <p className="text-sm text-muted-foreground mt-1">Come back tomorrow for new quests</p>
        </motion.div>
      )}
    </div>
  );
}
