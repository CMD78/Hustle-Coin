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

const PENDING_REFERRAL_KEY = "hc_pending_referral";

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

    console.log("[TelegramProvider] tg object present:", !!tg);
    console.log("[TelegramProvider] tg.initDataUnsafe:", JSON.stringify(tg?.initDataUnsafe ?? {}));
    console.log("[TelegramProvider] telegramId resolved to:", currentTelegramId);

    // Resolve the referrer ID using all possible sources, in priority order:
    // 1. tg.initDataUnsafe.start_param — set when app opened via direct Mini App link (?startapp=)
    // 2. ?ref= URL param — set by webhook reply button (our primary referral mechanism)
    // 3. ?startapp= URL param — fallback for direct app link format
    // 4. ?start= URL param — old fallback
    // 5. localStorage — persisted from a previous page load so reloads don't lose the referrer
    const params = new URLSearchParams(window.location.search);
    const startParam = tg?.initDataUnsafe?.start_param ?? null;
    const refParam = params.get("ref");
    const startAppParam = params.get("startapp");
    const startQueryParam = params.get("start");
    const storedReferral = localStorage.getItem(PENDING_REFERRAL_KEY);

    const referredBy =
      startParam ||
      refParam ||
      startAppParam ||
      startQueryParam ||
      storedReferral ||
      undefined;

    console.log("[TelegramProvider] referral sources:", {
      start_param: startParam,
      ref_param: refParam,
      startapp_param: startAppParam,
      start_param_url: startQueryParam,
      stored_referral: storedReferral,
      resolved: referredBy ?? "none",
    });

    // Persist the referral to localStorage so it survives reloads before init fires
    if (referredBy && referredBy !== currentTelegramId) {
      localStorage.setItem(PENDING_REFERRAL_KEY, referredBy);
      console.log("[TelegramProvider] persisted referral to localStorage:", referredBy);
    }

    initUser.mutate(
      {
        data: {
          telegramId: currentTelegramId,
          username: currentUser.username || "user",
          firstName: currentUser.first_name,
          lastName: currentUser.last_name,
          // Only send referredBy if it's truthy and not a self-referral
          referredBy: referredBy && referredBy !== currentTelegramId ? referredBy : undefined,
          initData: tg?.initData,
        },
      },
      {
        onSuccess: () => {
          // Clear stored referral after a successful init — whether it was used or not
          localStorage.removeItem(PENDING_REFERRAL_KEY);
          console.log("[TelegramProvider] init succeeded, cleared pending referral");
        },
        onError: () => {
          console.warn("[TelegramProvider] init failed — keeping pending referral for retry");
        },
      }
    );
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
