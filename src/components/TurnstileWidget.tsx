import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  action: string;
  onTokenChange: (token: string) => void;
};

const turnstileScriptId = "cf-turnstile-script";

function readTurnstileSiteKey() {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  return String(env.VITE_TURNSTILE_SITE_KEY || "").trim();
}

export function TurnstileWidget({ action, onTokenChange }: Props) {
  const siteKey = readTurnstileSiteKey();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const callbackRef = useRef(onTokenChange);
  const [scriptReady, setScriptReady] = useState(Boolean(window.turnstile));

  callbackRef.current = onTokenChange;

  useEffect(() => {
    callbackRef.current("");
    if (!siteKey) {
      setScriptReady(false);
      return;
    }
    if (window.turnstile) {
      setScriptReady(true);
      return;
    }

    const existing = document.getElementById(turnstileScriptId) as HTMLScriptElement | null;
    if (existing) {
      const handleReady = () => setScriptReady(Boolean(window.turnstile));
      existing.addEventListener("load", handleReady);
      return () => existing.removeEventListener("load", handleReady);
    }

    const script = document.createElement("script");
    script.id = turnstileScriptId;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(Boolean(window.turnstile));
    document.head.appendChild(script);
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile || widgetIdRef.current) {
      return;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "light",
      callback: (token: string) => callbackRef.current(token),
      "expired-callback": () => callbackRef.current(""),
      "error-callback": () => callbackRef.current(""),
    });

    return () => {
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      widgetIdRef.current = null;
    };
  }, [action, scriptReady, siteKey]);

  if (!siteKey) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      <p className="text-xs text-slate-500">
        Security verification helps protect this form from abuse.
      </p>
    </div>
  );
}

