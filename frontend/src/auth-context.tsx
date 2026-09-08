import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, loadStoredToken, persistToken, setUnauthorizedHandler } from "@/src/api";
import type { User } from "@/src/types";

WebBrowser.maybeCompleteAuthSession();

type AuthState = {
  user: User | null;
  loading: boolean;
  googleBusy: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string, ageConfirmed: boolean, agreedToTerms: boolean) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

const SESSION_RX = /[?#&]session_id=([^&#]+)/;

export function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(SESSION_RX);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const exchanged = useRef(new Set<string>());
  const queryClient = useQueryClient();

  const clearSession = useCallback(async () => {
    await persistToken(null);
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const exchangeSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (exchanged.current.has(sessionId)) return false;
    exchanged.current.add(sessionId);
    try {
      const data = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
        skipAuthHandler: true,
      });
      await persistToken(data.session_token);
      setUser(data.user);
      return true;
    } catch (e) {
      console.warn("Session exchange failed", e);
      return false;
    }
  }, []);

  // Boot: handle session_id in URL first, then check stored token.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    let cancelled = false;
    (async () => {
      try {
        let handled = false;
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = extractSessionId(window.location.hash) ?? extractSessionId(window.location.search);
          if (sid) {
            handled = await exchangeSession(sid);
            if (handled) {
              const url = new URL(window.location.href);
              url.searchParams.delete("session_id");
              url.hash = url.hash.replace(/[#&]?session_id=[^&#]+/, "");
              window.history.replaceState(window.history.state, "", url.toString());
            }
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) handled = await exchangeSession(sid);
        }
        if (!handled) {
          const token = await loadStoredToken();
          if (token) {
            try {
              const me = await api<User>("/auth/me", { skipAuthHandler: true });
              if (!cancelled) setUser(me);
            } catch {
              await persistToken(null);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchangeSession(sid);
    });
    return () => {
      cancelled = true;
      sub.remove();
      setUnauthorizedHandler(null);
    };
  }, [clearSession, exchangeSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuthHandler: true,
    });
    await persistToken(data.access_token);
    setUser(data.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, displayName: string, ageConfirmed: boolean, agreedToTerms: boolean) => {
    const data = await api<{ access_token: string; user: User }>("/auth/signup", {
      method: "POST",
      body: { email, password, display_name: displayName, age_confirmed: ageConfirmed, agreed_to_terms: agreedToTerms },
      skipAuthHandler: true,
    });
    await persistToken(data.access_token);
    setUser(data.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined" ? `${window.location.origin}/` : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    setGoogleBusy(true);
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      captured = captured ?? extractSessionId(url);
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let sid = result.type === "success" ? extractSessionId(result.url) : null;
      if (!sid) sid = captured;
      if (!sid) sid = extractSessionId(await Linking.getInitialURL());
      if (sid) await exchangeSession(sid);
    } finally {
      sub.remove();
      setGoogleBusy(false);
    }
  }, [exchangeSession]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", skipAuthHandler: true });
    } catch {
      // ignore
    }
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const me = await api<User>("/auth/me");
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, loading, googleBusy, login, signup, loginWithGoogle, logout, refreshUser, setUser }),
    [user, loading, googleBusy, login, signup, loginWithGoogle, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
