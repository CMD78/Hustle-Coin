import { useTelegram } from "@/lib/telegram";
import { useGetTasks, useCompleteTask } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, ExternalLink, Coins, Zap } from "lucide-react";
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

  const handleComplete = (taskId: number, link: string | null | undefined) => {
    if (link) window.open(link, "_blank");

    completeTask.mutate(
      { taskId, data: { telegramId } },
      {
        onSuccess: () => {
          toast({ title: "Task submitted!", description: "Awaiting admin approval to receive HC." });
          queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
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
          {available.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-bold text-base">{task.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                </div>
                <div className="flex items-center gap-1 bg-primary/10 border border-primary/30 rounded-full px-3 py-1 shrink-0">
                  <Coins className="w-3.5 h-3.5 text-primary" />
                  <span className="text-primary font-bold text-sm">+{task.reward}</span>
                </div>
              </div>
              <button
                onClick={() => handleComplete(task.id, task.link)}
                disabled={completeTask.isPending}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all"
              >
                {task.link && <ExternalLink className="w-4 h-4" />}
                {task.link ? "Go & Complete" : "Mark Complete"}
              </button>
            </motion.div>
          ))}
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
          {completed.map(task => (
            <div key={task.id} className="bg-card border border-green-500/20 rounded-2xl p-4 flex items-center gap-3 opacity-70">
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{task.title}</h3>
                <p className="text-xs text-muted-foreground">Approved ✓</p>
              </div>
              <div className="text-xs text-green-500 font-bold">+{task.reward} HC</div>
            </div>
          ))}
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
