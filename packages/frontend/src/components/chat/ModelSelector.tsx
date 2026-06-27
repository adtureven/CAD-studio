import { useEffect, useState, useRef } from "react";
import { ChevronDown, Check, Cpu } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface ModelsResponse {
  models?: ModelInfo[];
  default_model?: string;
}

export function ModelSelector() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const setModel = useChatStore((s) => s.setModel);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadModels = () => {
    fetch("/api/chat/models")
      .then((r) => r.json())
      .then((d: ModelsResponse) => {
        const list: ModelInfo[] = d.models || [];
        setModels(list);
        if (!list.length) return;

        const hasSelected = selectedModel && list.some((m) => m.id === selectedModel);
        if (!hasSelected) {
          const fallback =
            list.find((m) => m.id === d.default_model) ?? list[0]!;
          setModel(fallback.id);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    loadModels();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border border-border text-text-secondary hover:bg-cream-dark max-w-[160px]"
        title="选择模型"
      >
        <Cpu className="w-3 h-3 shrink-0" />
        <span className="truncate">{selectedModel || "Model"}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-md border border-border bg-surface shadow-lg py-1">
          {models.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-text-secondary">
              暂无可用模型，请在设置中配置
            </div>
          )}
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setModel(m.id);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-cream-dark"
            >
              <span className="flex flex-col">
                <span className="text-text-primary truncate">{m.name}</span>
                <span className="text-text-secondary/60 text-[10px]">{m.provider}</span>
              </span>
              {m.id === selectedModel && <Check className="w-3 h-3 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
