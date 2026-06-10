import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useInitUser } from "@workspace/api-client-react";

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramContextValue {
  telegramId: string;
  user: TelegramUser | null;
  isLoading: boolean;
}

const TelegramContext = createContext<TelegramContextValue | undefined>(undefined);

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [telegramId, setTelegramId] = useState<string>(
    localStorage.getItem("telegramId") || "123456789"
  );
  const [user, setUser] = useState<TelegramUser | null>(null);
  
  const initUser = useInitUser();

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#0a0a0a");
    }

    const tgUser = tg?.initDataUnsafe?.user;
    
    // Dev mock fallback
    const devUser = {
      id: 123456789,
      first_name: "Dev",
      username: "devuser"
    };

    const currentUser = tgUser || devUser;
    const currentTelegramId = String(currentUser.id);
    
    setUser(currentUser);
    setTelegramId(currentTelegramId);
    localStorage.setItem("telegramId", currentTelegramId);

    // Telegram passes the bot start param via initDataUnsafe.start_param,
    // NOT via window.location.search — check SDK first, then fall back to URL
    const params = new URLSearchParams(window.location.search);
    const referredBy =
      tg?.initDataUnsafe?.start_param ||
      params.get("startapp") ||
      params.get("start") ||
      undefined;

    initUser.mutate({
      data: {
        telegramId: currentTelegramId,
        username: currentUser.username || "user",
        firstName: currentUser.first_name,
        lastName: currentUser.last_name,
        referredBy,
        initData: tg?.initData
      }
    });
  }, []);

  return (
    <TelegramContext.Provider value={{ telegramId, user, isLoading: initUser.isPending }}>
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegram() {
  const context = useContext(TelegramContext);
  if (context === undefined) {
    throw new Error("useTelegram must be used within a TelegramProvider");
  }
  return context;
}
