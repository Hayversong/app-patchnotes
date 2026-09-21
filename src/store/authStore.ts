import { create } from "zustand";

import type { User } from "@/modules/auth/types/auth.types";

const TOKEN_COOKIE = "patchnotes_token";

function readTokenCookie(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${TOKEN_COOKIE}=`;
  const cookie = document.cookie.split("; ").find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

type AuthState = {
  user: User | null;
  token: string | null;
  setSession: (user: User, token: string) => void;
  setUser: (user: User) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: readTokenCookie(),
  setSession: (user, token) => {
    document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax`;
    set({ user, token });
  },
  setUser: (user) => set({ user }),
  clearSession: () => {
    document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0; samesite=lax`;
    set({ user: null, token: null });
  },
}));
