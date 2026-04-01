import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, fetchSession, type SessionResponse } from "./api";

type SessionState = {
  loading: boolean;
  session: SessionResponse | null;
  error: ApiError | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchSession();
      setSession(next);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setError(new ApiError(500, "unknown_error", "Unable to load session."));
      }
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      loading,
      session,
      error,
      refresh,
    }),
    [error, loading, refresh, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
