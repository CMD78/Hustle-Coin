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
      username: "devuser",
    };

    const currentUser = tgUser || devUser;
    const currentTelegramId = String(currentUser.id);

    setUser(currentUser);
    setTelegramId(currentTelegramId);
    localStorage.setItem("telegramId", currentTelegramId);

    console.log("[TelegramProvider] tg object present:", !!tg);
    console.log("[TelegramProvider] tg.initDataUnsafe:", JSON.stringify(tg?.initDataUnsafe ?? {}));
    console.log("[TelegramProvider] telegramId resolved to:", currentTelegramId);

    // ── Referral source resolution (priority order) ───────────────────────────
    // 1. tg.initDataUnsafe.start_param — set when app opened via ?startapp= Mini App link.
    //    This is the PRIMARY and most reliable source. Telegram always injects it.
    // 2. ?ref= URL param — legacy safety net used by old bot webhook reply buttons.
    // 3. ?startapp= URL param — direct URL-bar startapp (uncommon, but handled).
    // 4. ?start= URL param — old legacy format fallback.
    // 5. localStorage hc_pending_referral — persisted from a previous session so
    //    page reloads and navigations don't lose the referrer before /api/init fires.
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

    const referredBySource = startParam
      ? "tg.start_param"
      : refParam
      ? "url.ref"
      : startAppParam
      ? "url.startapp"
      : startQueryParam
      ? "url.start"
      : storedReferral
      ? "localStorage"
      : "none";

    console.log("[TelegramProvider] referral resolution:", {
      start_param: startParam,
      ref_param: refParam,
      startapp_param: startAppParam,
      start_query_param: startQueryParam,
      stored_referral: storedReferral,
      resolved: referredBy ?? "none",
      source: referredBySource,
    });

    const isSelfReferral = referredBy === currentTelegramId;
    const effectiveReferredBy = referredBy && !isSelfReferral ? referredBy : undefined;

    if (isSelfReferral) {
      console.warn("[TelegramProvider] self-referral detected — ignoring referredBy");
    }

    // Persist to localStorage so the referrer survives page reloads before init fires.
    // Only persist if it's not a self-referral.
    if (effectiveReferredBy) {
      localStorage.setItem(PENDING_REFERRAL_KEY, effectiveReferredBy);
      console.log("[TelegramProvider] persisted referral to localStorage:", effectiveReferredBy, "(source:", referredBySource + ")");
    }

    console.log("[TelegramProvider] calling /api/init with referredBy:", effectiveReferredBy ?? "none");

    initUser.mutate(
      {
        data: {
          telegramId: currentTelegramId,
          username: currentUser.username || "user",
          firstName: currentUser.first_name,
          lastName: currentUser.last_name,
          referredBy: effectiveReferredBy,
          initData: tg?.initData,
        },
      },
      {
        onSuccess: (data) => {
          const status = (data as any)?.referralStatus ?? "unknown";
          console.log("[TelegramProvider] /api/init succeeded — referralStatus:", status, "| balance:", (data as any)?.balance);

          // ── localStorage clearing strategy ──────────────────────────────────
          // Only clear the pending referral from localStorage when we're confident
          // it has been processed (or definitively can't be processed).
          //
          // CLEAR when:
          //   - "credited" → referral was successfully applied ✅
          //   - "skipped_duplicate" → referral row already exists (already credited) ✅
          //   - "welcome_bonus_only" / "no_referral" → no referredBy was sent at all
          //   - "skipped_self" / "skipped_invalid" → bad referral, no point retrying
          //   - "skipped_race_condition_duplicate" → DB caught a concurrent insert ✅
          //
          // KEEP when:
          //   - "skipped_referrer_not_found" → referrer not in DB yet; may appear later.
          //     Keep localStorage so the NEXT app open can retry the second-pass.
          //   - status is missing/unknown and a referredBy was sent → keep for safety.
          //
          const shouldClear =
            status === "credited" ||
            status === "skipped_duplicate" ||
            status === "welcome_bonus_only" ||
            status === "no_referral" ||
            status.startsWith("skipped_self") ||
            status.startsWith("skipped_invalid") ||
            status.startsWith("skipped_race_condition") ||
            !effectiveReferredBy; // no referredBy was sent, nothing to keep

          if (shouldClear) {
            localStorage.removeItem(PENDING_REFERRAL_KEY);
            console.log("[TelegramProvider] cleared pending referral from localStorage (status:", status + ")");
          } else {
            console.log("[TelegramProvider] keeping pending referral in localStorage for retry (status:", status + ")");
          }
        },
        onError: (err) => {
          console.warn("[TelegramProvider] /api/init failed — keeping pending referral for retry:", err);
          // Do NOT clear localStorage on network/server errors — let the next page load retry.
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
