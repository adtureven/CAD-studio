import { useRef, useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { MessageSquare, X, Plus } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";

interface ChatPanelProps {
  onSendMessage: (message: string, images?: string[]) => void;
}

export function ChatPanel({ onSendMessage }: ChatPanelProps) {
  const { toggleChatPanel } = useUIStore();
  const {
    isStreaming,
    currentThinking,
    currentResponse,
    selectedModel,
    setModel,
  } = useChatStore();
  const conversation = useChatStore((s) => s.getActiveConversation());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/chat/models")
      .then((r) => r.json())
      .then((data) => setAvailableModels(data.models || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, currentResponse]);

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-text-primary">
            AI Assistant
          </span>
          <button
            onClick={() => useChatStore.getState().createConversation()}
            className="p-1 rounded hover:bg-cream-dark text-text-secondary"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-cream text-text-primary"
          >
            {availableModels.length > 0 ? (
              availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))
            ) : (
              <option value={selectedModel}>{selectedModel}</option>
            )}
          </select>
          <button
            onClick={toggleChatPanel}
            className="p-1 rounded hover:bg-cream-dark text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!conversation?.messages.length && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-1">
              Describe your 3D model
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Tell me what you want to create, or upload an image for reference.
              I'll generate parametric CadQuery code and render the 3D model.
            </p>
          </div>
        )}

        {conversation?.messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isStreaming && (
          <>
            {currentThinking && (
              <ThinkingIndicator content={currentThinking} />
            )}
            {currentResponse && (
              <ChatMessage
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: currentResponse,
                  timestamp: Date.now(),
                }}
              />
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSendMessage={onSendMessage} isStreaming={isStreaming} />
    </aside>
  );
}
