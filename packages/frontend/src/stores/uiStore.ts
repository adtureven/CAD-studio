import { create } from "zustand";

interface UIStore {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  chatPanelOpen: boolean;
  settingsOpen: boolean;
  rightPanelTab: "parameters" | "code";

  sidebarWidth: number;
  rightPanelWidth: number;
  chatPanelWidth: number;

  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  toggleChatPanel: () => void;
  toggleSettings: () => void;
  setRightPanelTab: (tab: "parameters" | "code") => void;
  setSidebarWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  setChatPanelWidth: (w: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  rightPanelOpen: true,
  chatPanelOpen: true,
  settingsOpen: false,
  rightPanelTab: "parameters",

  sidebarWidth: 256,
  rightPanelWidth: 288,
  chatPanelWidth: 384,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: w }),
  setChatPanelWidth: (w) => set({ chatPanelWidth: w }),
}));
