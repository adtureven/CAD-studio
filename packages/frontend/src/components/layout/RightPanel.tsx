import { useState, useEffect, useCallback } from "react";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useUIStore } from "@/stores/uiStore";
import { ParameterPanel } from "../parameters/ParameterPanel";
import { Settings2, Code, Play, Loader2 } from "lucide-react";

interface RightPanelProps {
  onUpdateParameters: (
    code: string,
    parameters: Record<string, number | string | boolean>
  ) => void;
}

export function RightPanel({ onUpdateParameters }: RightPanelProps) {
  const { rightPanelTab, setRightPanelTab } = useUIStore();
  const { currentCode, setCode, setParameters } = useParameterStore();
  const [editableCode, setEditableCode] = useState(currentCode);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setEditableCode(currentCode);
  }, [currentCode]);

  const handleRun = useCallback(async () => {
    const code = editableCode.trim();
    if (!code) return;

    setIsRunning(true);
    setCode(code);
    useViewportStore.getState().setLoading(true);

    try {
      const res = await fetch("/api/cad/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success && data.model_url) {
        useViewportStore.getState().setModelUrl(data.model_url, data.format || "step");
        if (data.parameters) setParameters(data.parameters);
      } else {
        useViewportStore.getState().setError(data.error || "Execution failed");
      }
    } catch (e) {
      useViewportStore.getState().setError("Failed to connect to backend");
    } finally {
      setIsRunning(false);
    }
  }, [editableCode, setCode, setParameters]);

  return (
    <aside className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border flex gap-1">
        <button
          onClick={() => setRightPanelTab("parameters")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            rightPanelTab === "parameters"
              ? "bg-primary-light text-primary"
              : "text-text-secondary hover:bg-cream-dark"
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Parameters
        </button>
        <button
          onClick={() => setRightPanelTab("code")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            rightPanelTab === "code"
              ? "bg-primary-light text-primary"
              : "text-text-secondary hover:bg-cream-dark"
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          Code
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-3 flex flex-col">
        {rightPanelTab === "parameters" ? (
          <div className="overflow-y-auto">
            <ParameterPanel onUpdateParameters={onUpdateParameters} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary">CadQuery Editor</span>
              <button
                onClick={handleRun}
                disabled={isRunning || !editableCode.trim()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Run
              </button>
            </div>
            <textarea
              value={editableCode}
              onChange={(e) => setEditableCode(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleRun();
                }
              }}
              spellCheck={false}
              className="flex-1 w-full rounded-lg bg-[#2D3B2D] text-[#E8F0E8] p-3 text-xs font-mono leading-relaxed resize-none outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="// Enter CadQuery code here...&#10;// Press Ctrl+Enter or click Run to execute"
            />
          </>
        )}
      </div>
    </aside>
  );
}
