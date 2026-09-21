"use client";

import { create } from "zustand";

// In-memory UI preference survives client-side navigation for this app session.
export const useUiStore = create<{
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
