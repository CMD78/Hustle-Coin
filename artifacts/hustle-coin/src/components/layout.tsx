import { Link, useLocation } from "wouter";
import { Home, CheckSquare, Users, Trophy, Wallet, User } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const tabs = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/tasks", icon: CheckSquare, label: "Tasks" },
    { href: "/referrals", icon: Users, label: "Refer" },
    { href: "/leaderboard", icon: Trophy, label: "Rank" },
    { href: "/wallet", icon: Wallet, label: "Wallet" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] max-w-[430px] mx-auto bg-background text-foreground relative pb-20 shadow-2xl overflow-x-hidden border-x border-border/10">
      <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-4">
        {children}
      </main>
      <nav className="fixed bottom-0 w-full max-w-[430px] bg-card/95 backdrop-blur-md border-t border-border flex justify-around items-center py-2 px-1 z-50">
        {tabs.map(tab => {
          const active = location === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-xl transition-all ${
                active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <tab.icon className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
