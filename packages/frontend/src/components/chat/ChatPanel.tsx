import { useRef, useEffect, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { AgentPanel } from "./AgentPanel";
import { ModelSelector } from "./ModelSelector";
import { Bot, MessageSquare, X, Plus } from "lucide-react";
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
  } = useChatStore();
  const conversation = useChatStore((s) => s.getActiveConversation());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"cad" | "agent">("cad");


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages, currentResponse, currentThinking]);

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-text-primary">
            AI 助手
          </span>
          <button
            onClick={() => useChatStore.getState().createConversation()}
            className="p-1 rounded hover:bg-cream-dark text-text-secondary"
            title="新建对话"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <div className="ml-1 flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode("cad")}
              className={`px-2 py-0.5 text-[11px] ${
                mode === "cad"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-cream-dark"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setMode("agent")}
              className={`px-2 py-0.5 text-[11px] flex items-center gap-1 ${
                mode === "agent"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-cream-dark"
              }`}
            >
              <Bot className="w-3 h-3" />
              Agent
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModelSelector />
          <button
            onClick={toggleChatPanel}
            className="p-1 rounded hover:bg-cream-dark text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mode === "agent" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <AgentPanel />
        </div>
      ) : (
        <>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {!conversation?.messages.length && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-primary-light flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-1">
              描述你的 3D 模型
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              告诉我你想创建什么，或上传一张图片作为参考。
              我会生成参数化的 CadQuery 代码并渲染出 3D 模型。
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
        </>
      )}
    </aside>
  );
}
