import { useTelegram } from "@/lib/telegram";
import { useGetTasks, useCompleteTask } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, ExternalLink, Coins, Zap, Bolt } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Tasks() {
  const { telegramId } = useTelegram();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tasks, isLoading } = useGetTasks(
    { telegramId },
    { query: { enabled: !!telegramId } as any }
  );

  const completeTask = useCompleteTask();

  const handleComplete = (taskId: number, link: string | null | undefined, taskType: "automatic" | "manual", reward: number) => {
    if (link) window.open(link, "_blank");

    completeTask.mutate(
      { taskId, data: { telegramId } },
      {
        onSuccess: (data) => {
          if (taskType === "automatic") {
            toast({
              title: `+${reward} HC credited instantly!`,
              description: "Automatic task reward has been added to your balance.",
            });
          } else {
            toast({
              title: "Task submitted!",
              description: "Awaiting admin approval to receive HC.",
            });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        },
        onError: () => {
          toast({ title: "Already submitted", description: "You already completed this task.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded-lg animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const pending = tasks?.filter(t => t.completed && !t.approved) ?? [];
  const available = tasks?.filter(t => !t.completed) ?? [];
  const completed = tasks?.filter(t => t.completed && t.approved) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground text-sm mt-1">Complete tasks to earn HC coins</p>
      </div>

      {available.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Available</h2>
          {available.map((task, i) => {
            const isAuto = task.taskType === "automatic";
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-card border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${
                  isAuto ? "border-green-500/30 hover:border-green-500/50" : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-base">{task.title}</h3>
                      {isAuto ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                          <Zap className="w-2.5 h-2.5" />
                          INSTANT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full">
                          <Clock className="w-2.5 h-2.5" />
                          MANUAL
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </div>
                  <div className={`flex items-center gap-1 border rounded-full px-3 py-1 shrink-0 ${
                    isAuto ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-primary/10 border-primary/30 text-primary"
                  }`}>
                    <Coins className="w-3.5 h-3.5" />
                    <span className="font-bold text-sm">+{task.reward}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleComplete(task.id, task.link, task.taskType, task.reward)}
                  disabled={completeTask.isPending}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all ${
                    isAuto
                      ? "bg-green-500 text-white hover:bg-green-600"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {task.link && <ExternalLink className="w-4 h-4" />}
                  {isAuto
                    ? (task.link ? "Go & Earn Instantly" : "Claim Instantly")
                    : (task.link ? "Go & Complete" : "Mark Complete")}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pending Review</h2>
          {pending.map(task => (
            <div key={task.id} className="bg-card border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3 opacity-80">
              <Clock className="w-5 h-5 text-yellow-500 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{task.title}</h3>
                <p className="text-xs text-muted-foreground">Submitted — awaiting admin approval</p>
              </div>
              <div className="text-xs text-yellow-500 font-bold">+{task.reward} HC</div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Completed</h2>
          {completed.map(task => {
            const isAuto = task.taskType === "automatic";
            return (
              <div key={task.id} className="bg-card border border-green-500/20 rounded-2xl p-4 flex items-center gap-3 opacity-70">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm">{task.title}</h3>
                    {isAuto && (
                      <span className="text-[9px] text-green-400 font-bold bg-green-500/10 px-1 rounded">AUTO</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{isAuto ? "Rewarded instantly ✓" : "Approved ✓"}</p>
                </div>
                <div className="text-xs text-green-500 font-bold">+{task.reward} HC</div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && tasks?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Zap className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="font-bold text-lg">No Tasks Yet</h3>
          <p className="text-muted-foreground text-sm mt-1">New tasks will appear here soon</p>
        </div>
      )}
    </div>
  );
}
