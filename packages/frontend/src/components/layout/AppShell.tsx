import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { RightPanel } from "./RightPanel";
import { MainViewport } from "./MainViewport";
import { ChatPanel } from "../chat/ChatPanel";
import { ResizeHandle } from "./ResizeHandle";
import { SettingsModal } from "../common/SettingsModal";
import { useUIStore } from "@/stores/uiStore";
import { useCallback, useState } from "react";

interface AppShellProps {
  onSendMessage: (message: string, images?: string[]) => void;
  onUpdateParameters: (
    code: string,
    parameters: Record<string, number | string | boolean>
  ) => void;
}

export function AppShell({ onSendMessage, onUpdateParameters }: AppShellProps) {
  const { sidebarOpen, rightPanelOpen, chatPanelOpen, sidebarWidth, rightPanelWidth, chatPanelWidth } = useUIStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleSidebarResize = useCallback((delta: number) => {
    const { sidebarWidth: w, setSidebarWidth } = useUIStore.getState();
    setSidebarWidth(Math.max(180, Math.min(400, w + delta)));
  }, []);

  const handleRightPanelResize = useCallback((delta: number) => {
    const { rightPanelWidth: w, setRightPanelWidth } = useUIStore.getState();
    setRightPanelWidth(Math.max(200, Math.min(500, w - delta)));
  }, []);

  const handleChatPanelResize = useCallback((delta: number) => {
    const { chatPanelWidth: w, setChatPanelWidth } = useUIStore.getState();
    setChatPanelWidth(Math.max(280, Math.min(600, w - delta)));
  }, []);

  const transitionClass = isDragging ? "" : "transition-[width] duration-200 ease-out";

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-cream">
      <TopNav />
      <SettingsModal />
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <aside
          className={`flex-shrink-0 border-r border-border bg-surface overflow-hidden ${transitionClass}`}
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : "0px" }}
        >
          <div className="h-full" style={{ width: `${sidebarWidth}px` }}>
            <Sidebar />
          </div>
        </aside>

        {sidebarOpen && (
          <ResizeHandle
            onResize={handleSidebarResize}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
          />
        )}

        {/* Main Viewport */}
        <div className="flex-1 min-w-[200px] min-h-0 h-full relative">
          <MainViewport />
        </div>

        {/* Right Panel */}
        {rightPanelOpen && (
          <ResizeHandle
            onResize={handleRightPanelResize}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
          />
        )}
        <aside
          className={`flex-shrink-0 border-l border-border bg-surface overflow-hidden ${transitionClass}`}
          style={{ width: rightPanelOpen ? `${rightPanelWidth}px` : "0px" }}
        >
          <div className="h-full" style={{ width: `${rightPanelWidth}px` }}>
            <RightPanel onUpdateParameters={onUpdateParameters} />
          </div>
        </aside>

        {/* Chat Panel */}
        {chatPanelOpen && (
          <ResizeHandle
            onResize={handleChatPanelResize}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
          />
        )}
        <aside
          className={`flex-shrink-0 border-l border-border bg-surface overflow-hidden ${transitionClass}`}
          style={{ width: chatPanelOpen ? `${chatPanelWidth}px` : "0px" }}
        >
          <div className="h-full" style={{ width: `${chatPanelWidth}px` }}>
            <ChatPanel onSendMessage={onSendMessage} />
          </div>
        </aside>
      </div>
    </div>
  );
}
