import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TelegramProvider } from "@/lib/telegram";
import Layout from "@/components/layout";
import SplashScreen from "@/components/splash-screen";
import WelcomeModal from "@/components/welcome-modal";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Mine from "@/pages/mine";
import Tasks from "@/pages/tasks";
import Quests from "@/pages/quests";
import Achievements from "@/pages/achievements";
import Referrals from "@/pages/referrals";
import Leaderboard from "@/pages/leaderboard";
import Profile from "@/pages/profile";
import Wallet from "@/pages/wallet";
import Admin from "@/pages/admin";
import Feedback from "@/pages/feedback";
import TelegramStatus from "@/pages/telegram-status";
import TelegramConnect from "@/pages/telegram-connect";
import AdminSettings from "@/pages/admin-settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/mine" component={Mine} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/quests" component={Quests} />
        <Route path="/achievements" component={Achievements} />
        <Route path="/referrals" component={Referrals} />
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/profile" component={Profile} />
        <Route path="/wallet" component={Wallet} />
        <Route path="/feedback" component={Feedback} />
        <Route path="/admin" component={Admin} />
        <Route path="/telegram-status" component={TelegramStatus} />
        <Route path="/telegram-connect" component={TelegramConnect} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <TelegramProvider>
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          {splashDone && <WelcomeModal bonus={250} />}
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </TelegramProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
