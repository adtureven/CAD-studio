import { useState, useRef, useCallback, useEffect } from "react";
import { Send, ImagePlus, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string, images?: string[]) => void;
  isStreaming: boolean;
}

export function ChatInput({ onSendMessage, isStreaming }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 128) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [message, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && images.length === 0) return;
    if (isStreaming) return;

    onSendMessage(trimmed, images.length > 0 ? images : undefined);
    setMessage("");
    setImages([]);
  }, [message, images, isStreaming, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        if (base64) {
          setImages((prev) => [...prev, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="p-3 border-t border-border">
      {images.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative w-12 h-12 rounded-md overflow-hidden border border-border">
              <img
                src={`data:image/png;base64,${img}`}
                className="w-full h-full object-cover"
                alt=""
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-bl"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 bg-cream rounded-xl px-3 py-2 border border-border">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          title="上传图片"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageUpload}
        />

        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述一个 3D 模型..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-secondary/60 outline-none overflow-y-auto"
          style={{ minHeight: "24px", maxHeight: "128px" }}
        />

        <button
          onClick={handleSend}
          disabled={isStreaming || (!message.trim() && images.length === 0)}
          className="p-1.5 rounded-md bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors"
        >
          {isStreaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
