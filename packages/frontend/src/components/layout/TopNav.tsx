import {
  PanelLeft,
  PanelRight,
  MessageSquare,
  Settings,
  Box,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";

export function TopNav() {
  const { toggleSidebar, toggleRightPanel, toggleChatPanel, toggleSettings } = useUIStore();

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-surface">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Box className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-xl font-serif font-semibold text-text-primary">
          CAD AI Studio
        </h1>
        <span className="text-xs text-text-secondary ml-2">
          AI-Powered Parametric Design
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          title="Toggle Sidebar"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        <button
          onClick={toggleRightPanel}
          className="p-2 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          title="Toggle Parameters"
        >
          <PanelRight className="w-5 h-5" />
        </button>
        <button
          onClick={toggleChatPanel}
          className="p-2 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          title="Toggle Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
        <button
          onClick={toggleSettings}
          className="p-2 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
