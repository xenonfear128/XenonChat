'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CornerStyle, Locale, PublicUser, ThemeMode } from '@/types';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: PublicUser | null;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  setSession: (payload: {
    accessToken: string;
    refreshToken: string;
    user: PublicUser;
  }) => void;
  setUser: (user: PublicUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
  applyPreferences: (prefs: {
    theme?: ThemeMode | string;
    corner_style?: CornerStyle | string;
    language?: Locale | string;
  }) => void;
};

function syncAuthCookie(accessToken: string | null) {
  if (typeof document === 'undefined') return;
  if (accessToken) {
    document.cookie = `xc_access=${accessToken}; path=/; max-age=2592000; SameSite=Lax`;
  } else {
    document.cookie = 'xc_access=; path=/; max-age=0; SameSite=Lax';
  }
}

function syncLocaleCookie(locale?: string) {
  if (typeof document === 'undefined' || !locale) return;
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      setSession: ({ accessToken, refreshToken, user }) => {
        syncAuthCookie(accessToken);
        syncLocaleCookie(user.language);
        set({ accessToken, refreshToken, user });
      },
      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => {
        syncAuthCookie(accessToken);
        set({ accessToken, refreshToken });
      },
      clear: () => {
        syncAuthCookie(null);
        set({ accessToken: null, refreshToken: null, user: null });
      },
      applyPreferences: (prefs) => {
        const user = get().user;
        if (!user) return;
        const next = {
          ...user,
          ...(prefs.theme ? { theme: prefs.theme } : {}),
          ...(prefs.corner_style ? { corner_style: prefs.corner_style } : {}),
          ...(prefs.language ? { language: prefs.language } : {}),
        };
        if (prefs.language) syncLocaleCookie(prefs.language);
        set({ user: next });
      },
    }),
    {
      name: 'xenonchat-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) syncAuthCookie(state.accessToken);
        if (state?.user?.language) syncLocaleCookie(state.user.language);
        state?.setHydrated(true);
      },
    },
  ),
);
