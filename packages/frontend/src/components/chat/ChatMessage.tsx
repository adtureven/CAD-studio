import type { ChatMessage as ChatMessageType } from "@/types/chat";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? "bg-primary-light" : "bg-cream-dark"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-text-secondary" />
        )}
      </div>

      <div
        className={`flex-1 min-w-0 ${isUser ? "text-right" : "text-left"}`}
      >
        <div
          className={`inline-block rounded-xl px-3.5 py-2.5 text-sm leading-relaxed max-w-full ${
            isUser
              ? "bg-primary text-white rounded-tr-sm"
              : "bg-cream text-text-primary rounded-tl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none [&_pre]:bg-[#2D3B2D] [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-xs [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-cream-dark [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const inline = !match;
                    if (inline) {
                      return (
                        <code
                          className="bg-cream-dark px-1 py-0.5 rounded text-xs"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <SyntaxHighlighter
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
