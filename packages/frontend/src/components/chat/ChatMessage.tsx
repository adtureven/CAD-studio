import { memo } from "react";
import type { ChatMessage as ChatMessageType } from "@/types/chat";
import { User, Bot } from "lucide-react";
import { CollapsibleContent } from "./CollapsibleContent";
import { ImageAttachments } from "./ImageAttachments";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessageProps {
  message: ChatMessageType;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
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
        className={`flex-1 min-w-0 ${isUser ? "flex justify-end" : ""}`}
      >
        <div
          className={`inline-block min-w-0 rounded-xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] text-left ${
            isUser
              ? "bg-primary text-white rounded-tr-sm"
              : "bg-cream text-text-primary rounded-tl-sm"
          }`}
        >
          <ImageAttachments images={message.images ?? []} className="mb-2" />
          {isUser ? (
            <CollapsibleContent
              content={message.content}
              maxChars={900}
              maxLines={12}
              previewClassName="whitespace-pre-wrap break-words"
              buttonClassName="mt-2 border-white/25 bg-white/10 text-white/85 hover:border-white/40 hover:text-white"
            />
          ) : (
            <CollapsibleContent
              content={message.content}
              maxChars={1200}
              maxLines={18}
              previewClassName="whitespace-pre-wrap break-words"
              renderContent={(content) => (
                <MarkdownContent
                  content={content}
                  className="prose prose-sm max-w-full [&_pre]:bg-[#2D3B2D] [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:text-xs [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-cream-dark [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1"
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
});
