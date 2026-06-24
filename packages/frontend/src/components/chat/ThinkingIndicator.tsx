import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { CollapsibleContent } from "./CollapsibleContent";

interface ThinkingIndicatorProps {
  content: string;
}

export function ThinkingIndicator({ content }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, expanded]);

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-cream-dark flex items-center justify-center flex-shrink-0">
        <Brain className="w-3.5 h-3.5 text-text-secondary animate-pulse" />
      </div>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors mb-1"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="italic">思考中...</span>
        </button>

        {expanded && (
          <div
            ref={contentRef}
            className="rounded-lg bg-cream border border-border-light p-3 text-xs text-text-secondary italic leading-relaxed max-h-48 overflow-y-auto"
          >
            <CollapsibleContent
              content={content}
              maxChars={900}
              maxLines={12}
              previewClassName="whitespace-pre-wrap break-words"
            />
          </div>
        )}
      </div>
    </div>
  );
}
