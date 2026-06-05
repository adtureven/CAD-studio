import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Loader2,
  Send,
  Terminal,
  Wrench,
} from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import type { ParameterDef } from "@/types/model";
import { useLibraryStore } from "@/stores/libraryStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";
import { getBackendWsUrl } from "@/utils/backendWs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

type AgentEntry = {
  id: string;
  role: "user" | "agent" | "tool" | "system" | "error";
  title: string;
  content?: string;
  status?: "running" | "success" | "error";
};

type AgentRunStatus = {
  label: string;
  detail?: string;
  startedAt: number;
  updatedAt: number;
};

type ConnectionState = "connecting" | "connected" | "disconnected";

export function AgentPanel() {
  const selectedModel = useChatStore((s) => s.selectedModel);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const createConversation = useChatStore((s) => s.createConversation);
  const [entries, setEntries] = useState<AgentEntry[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<AgentRunStatus | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const wsUrlRef = useRef(getBackendWsUrl("/api/agent/ws"));
  const lastActiveConversationIdRef = useRef<string | null>(activeConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      clearReconnectTimer();
      setConnectionState("connecting");

      let opened = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrlRef.current);
      } catch {
        reconnectTimerRef.current = window.setTimeout(connect, 1200);
        return;
      }
      const openTimer = window.setTimeout(() => {
        if (!opened) ws.close();
      }, 2500);
      wsRef.current = ws;

      ws.onopen = () => {
        opened = true;
        window.clearTimeout(openTimer);
        setConnectionState("connected");
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleAgentEvent(data, setEntries, setIsRunning, setRunStatus);
        } catch {
          setEntries((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "error",
              title: "Agent event error",
              content: "Failed to parse an agent event from the backend.",
              status: "error",
            },
          ]);
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        window.clearTimeout(openTimer);
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        setConnectionState("disconnected");
        setIsRunning(false);
        setRunStatus(null);
        reconnectTimerRef.current = window.setTimeout(connect, 1200);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearReconnectTimer();
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!activeConversationId || activeConversationId === lastActiveConversationIdRef.current) return;
    lastActiveConversationIdRef.current = activeConversationId;
    setEntries([]);
    setIsRunning(false);
    setRunStatus(null);
  }, [activeConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  useEffect(() => {
    if (!isRunning) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const send = useCallback(() => {
    const message = input.trim();
    if (!message || isRunning || wsRef.current?.readyState !== WebSocket.OPEN) return;

    let conversationId = activeConversationId;
    if (!conversationId) {
      conversationId = createConversation();
      lastActiveConversationIdRef.current = conversationId;
    }

    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        title: "You",
        content: message,
      },
    ]);
    setInput("");
    setIsRunning(true);
    setRunStatus(makeRunStatus("Starting Claude Code", "Launching isolated cadquery.py session"));
    wsRef.current.send(
      JSON.stringify({
        type: "agent_request",
        payload: {
          conversation_id: conversationId,
          message,
          model: selectedModel,
        },
      })
    );
  }, [activeConversationId, createConversation, input, isRunning, selectedModel]);

  const status = useMemo(() => {
    if (isRunning) return "Running";
    if (connectionState === "connected") return "Ready";
    if (connectionState === "connecting") return "Connecting";
    return "Reconnecting";
  }, [connectionState, isRunning]);

  const isConnected = connectionState === "connected";
  const elapsedSeconds = runStatus ? Math.max(0, Math.floor((clock - runStatus.startedAt) / 1000)) : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-surface text-text-primary">
      <div className="px-3 py-2 border-b border-border bg-cream/70 flex items-center justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-7 h-7 rounded-md border border-border bg-surface flex items-center justify-center">
            <Code2 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">Code Agent</div>
            <div className="text-[11px] text-text-secondary truncate">Claude Code cadquery.py session</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md border ${
            isConnected
              ? "border-primary/25 text-primary bg-primary-light"
              : "border-warning/30 text-warning bg-warning/10"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-primary" : "bg-warning"}`} />
          {status}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-surface">
        {entries.length === 0 && (
          <div className="h-full flex flex-col justify-center text-center px-5 text-text-secondary">
            <div className="mx-auto w-10 h-10 rounded-md bg-cream border border-border flex items-center justify-center mb-3">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-1">Agent session</h3>
            <p className="text-xs leading-relaxed">Describe the CAD edit for this session file.</p>
          </div>
        )}

        {entries.map((entry) => (
          <AgentEntryView key={entry.id} entry={entry} />
        ))}

        {isRunning && (
          <AgentRunStatusView status={runStatus} elapsedSeconds={elapsedSeconds} />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border bg-surface">
        <div className="rounded-lg bg-cream border border-border overflow-hidden shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the agent to edit cadquery.py"
            rows={3}
            className="w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
          />
          <div className="flex items-center justify-between px-2 py-2 border-t border-border-light">
            <span className="text-[11px] text-text-secondary">Enter to send / Shift+Enter newline</span>
            <button
              onClick={send}
              disabled={!isConnected || isRunning || !input.trim()}
              className="w-7 h-7 rounded-md bg-primary hover:bg-primary-hover text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              title="Send"
            >
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function handleAgentEvent(
  data: { type: string; payload?: Record<string, unknown> },
  setEntries: Dispatch<SetStateAction<AgentEntry[]>>,
  setIsRunning: Dispatch<SetStateAction<boolean>>,
  setRunStatus: Dispatch<SetStateAction<AgentRunStatus | null>>
) {
  const payload = data.payload ?? {};

  if (data.type === "agent_heartbeat") {
    updateRunStatus(setRunStatus, "Waiting for model output", "Claude Code is still running");
    return;
  }

  if (data.type === "agent_start") {
    updateRunStatus(setRunStatus, "Starting Claude Code", "Request sent to Mimo");
    return;
  }

  if (data.type === "agent_done") {
    setIsRunning(false);
    setRunStatus(null);
    useParameterStore.getState().setExecuting(false);
    useViewportStore.getState().setLoading(false);
    const code = Number(payload.return_code);
    if (code === 0) return;
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "error",
        title: "Agent exited with error",
        content: `exit code ${String(payload.return_code ?? "unknown")}`,
        status: "error",
      },
    ]);
    return;
  }

  if (data.type === "agent_error" || data.type === "agent_stderr") {
    const message = String(payload.message ?? payload.content ?? "");
    if (data.type === "agent_error") {
      setIsRunning(false);
      setRunStatus(null);
      useParameterStore.getState().setExecuting(false);
      useViewportStore.getState().setError(message || "Agent error");
    } else {
      updateRunStatus(setRunStatus, "Reading agent output");
    }
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "error",
        title: data.type === "agent_error" ? "Agent error" : "stderr",
        content: message,
        status: "error",
      },
    ]);
    return;
  }

  if (data.type === "agent_text") {
    updateRunStatus(setRunStatus, "Reading assistant output");
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "agent",
        title: "Assistant",
        content: String(payload.content ?? ""),
      },
    ]);
    return;
  }

  if (data.type === "agent_code") {
    updateRunStatus(setRunStatus, "Reading updated cadquery.py");
    const code = typeof payload.code === "string" ? payload.code : "";
    if (code) useParameterStore.getState().setCode(code);
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "tool",
        title: "cadquery.py updated",
        status: "success",
      },
    ]);
    return;
  }

  if (data.type === "agent_cad_executing") {
    updateRunStatus(setRunStatus, "Rendering cadquery.py", "Executing CadQuery backend");
    useParameterStore.getState().setExecuting(true);
    useViewportStore.getState().setLoading(true);
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "tool",
        title: "Render cadquery.py",
        status: "running",
      },
    ]);
    return;
  }

  if (data.type === "agent_cad_result") {
    setIsRunning(false);
    setRunStatus(null);
    const modelUrl = typeof payload.model_url === "string" ? payload.model_url : "";
    const format = payload.format === "gltf" ? "gltf" : "step";
    const parameterStore = useParameterStore.getState();
    const viewportStore = useViewportStore.getState();
    const parameters = Array.isArray(payload.parameters) ? (payload.parameters as ParameterDef[]) : [];

    parameterStore.setExecuting(false);
    parameterStore.setParameters(parameters);

    if (!modelUrl) {
      viewportStore.setError("CAD backend did not return a model URL");
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "error",
          title: "CAD render failed",
          content: "CAD backend did not return a model URL",
          status: "error",
        },
      ]);
      return;
    }

    viewportStore.setModelUrl(modelUrl, format);
    useLibraryStore.getState().addModel({
      name: "Agent model",
      code: parameterStore.currentCode,
      modelUrl,
      format,
    });
    setEntries((prev) => [
      ...prev.map((entry) =>
        entry.title === "Render cadquery.py" && entry.status === "running"
          ? { ...entry, status: "success" as const }
          : entry
      ),
      {
        id: crypto.randomUUID(),
        role: "tool",
        title: "CAD rendered",
        status: "success",
      },
    ]);
    return;
  }

  if (data.type === "agent_cad_error") {
    updateRunStatus(setRunStatus, "CAD render failed", "Preparing repair if attempts remain");
    const error = String(payload.error ?? "CAD execution failed");
    useParameterStore.getState().setExecuting(false);
    useViewportStore.getState().setError(error);
    setEntries((prev) => [
      ...prev.map((entry) =>
        entry.title === "Render cadquery.py" && entry.status === "running"
          ? { ...entry, status: "error" as const }
          : entry
      ),
      {
        id: crypto.randomUUID(),
        role: "error",
        title: "CAD execution failed",
        content: error,
        status: "error",
      },
    ]);
    return;
  }

  if (data.type === "agent_repair_start") {
    setIsRunning(true);
    const attempt = Number(payload.attempt ?? 1);
    const maxAttempts = Number(payload.max_attempts ?? attempt);
    updateRunStatus(setRunStatus, `Repairing CAD (${attempt}/${maxAttempts})`, "Feeding render error back to Claude Code");
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "tool",
        title: `Repair CAD (${attempt}/${maxAttempts})`,
      },
    ]);
    return;
  }

  if (data.type === "agent_event") {
    const event = payload.event;
    const activity = statusFromClaudeEvent(event);
    if (activity) updateRunStatus(setRunStatus, activity.label, activity.detail);
    const visibleEntries = summarizeClaudeEvent(event);
    if (visibleEntries.length > 0) {
      setEntries((prev) => {
        const filtered = visibleEntries.filter(
          (entry) => entry.title !== "Initialized" || !prev.some((item) => item.title === "Initialized")
        );
        return filtered.length > 0 ? [...prev, ...filtered] : prev;
      });
    }
  }
}

function summarizeClaudeEvent(event: unknown): AgentEntry[] {
  const item = asRecord(event);
  const type = String(item.type ?? "");

  if (type === "system") {
    const subtype = String(item.subtype ?? "");
    if (subtype === "init") {
      return [
        {
          id: crypto.randomUUID(),
          role: "system",
          title: "Initialized",
          status: "success",
        },
      ];
    }
    return [];
  }

  if (type === "assistant" || type === "message") {
    const message = asRecord(item.message);
    return entriesFromContent(message.content ?? item.content);
  }

  if (type === "user") {
    const message = asRecord(item.message);
    return entriesFromContent(message.content ?? item.content, true);
  }

  if (type === "result") {
    if (!Boolean(item.is_error)) return [];
    return [
      {
        id: crypto.randomUUID(),
        role: "error",
        title: "Agent failed",
        content: summarizeResult(item),
        status: "error",
      },
    ];
  }

  if (type === "error") {
    return [
      {
        id: crypto.randomUUID(),
        role: "error",
        title: "Error",
        content: String(item.message ?? "Unknown agent error"),
        status: "error",
      },
    ];
  }

  return [];
}

function statusFromClaudeEvent(event: unknown): Pick<AgentRunStatus, "label" | "detail"> | null {
  const item = asRecord(event);
  const type = String(item.type ?? "");
  const message = asRecord(item.message);
  const content = message.content ?? item.content;

  if (type === "system" && String(item.subtype ?? "") === "init") {
    return { label: "Initializing Claude Code" };
  }

  if (type === "assistant" || type === "message") {
    const toolNames = toolUseNames(content);
    if (toolNames.length > 0) {
      const primaryTool = toolNames[0];
      return {
        label: `Running tool: ${primaryTool}`,
        detail: toolNames.length > 1 ? `${toolNames.length} tool calls in this step` : undefined,
      };
    }
    if (hasTextContent(content)) {
      return { label: "Reading assistant output" };
    }
  }

  if (type === "user" && hasToolResult(content)) {
    return { label: "Processing tool result" };
  }

  if (type === "result") {
    return Boolean(item.is_error)
      ? { label: "Agent failed" }
      : { label: "Finalizing agent output" };
  }

  if (type === "error") {
    return { label: "Agent error" };
  }

  return null;
}

function entriesFromContent(content: unknown, fromUser = false): AgentEntry[] {
  if (typeof content === "string" && content.trim()) {
    return [
      {
        id: crypto.randomUUID(),
        role: fromUser ? "system" : "agent",
        title: fromUser ? "Tool result" : "Assistant",
        content,
      },
    ];
  }

  if (!Array.isArray(content)) return [];

  const entries: AgentEntry[] = [];
  const text = content
    .map((block) => {
      const obj = asRecord(block);
      return obj.type === "text" && typeof obj.text === "string" ? obj.text : "";
    })
    .filter(Boolean)
    .join("\n");

  if (text.trim()) {
    entries.push({
      id: crypto.randomUUID(),
      role: "agent",
      title: "Assistant",
      content: text,
    });
  }

  for (const block of content) {
    const obj = asRecord(block);
    if (obj.type === "tool_use") {
      entries.push({
        id: crypto.randomUUID(),
        role: "tool",
        title: `Use ${String(obj.name ?? "tool")}`,
        content: summarizeToolInput(String(obj.name ?? "tool"), asRecord(obj.input)),
      });
    } else if (obj.type === "tool_result" && Boolean(obj.is_error)) {
      entries.push({
        id: crypto.randomUUID(),
        role: "error",
        title: "Tool error",
        content: summarizeToolResult(obj.content),
        status: "error",
      });
    }
  }

  return entries;
}

function makeRunStatus(label: string, detail?: string): AgentRunStatus {
  const now = Date.now();
  return { label, detail, startedAt: now, updatedAt: now };
}

function updateRunStatus(
  setRunStatus: Dispatch<SetStateAction<AgentRunStatus | null>>,
  label: string,
  detail?: string
) {
  const now = Date.now();
  setRunStatus((prev) => ({
    label,
    detail,
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
  }));
}

function toolUseNames(content: unknown) {
  if (!Array.isArray(content)) return [];
  return content
    .map((block) => {
      const obj = asRecord(block);
      return obj.type === "tool_use" ? String(obj.name ?? "tool") : "";
    })
    .filter(Boolean);
}

function hasToolResult(content: unknown) {
  return Array.isArray(content) && content.some((block) => asRecord(block).type === "tool_result");
}

function hasTextContent(content: unknown) {
  if (typeof content === "string") return content.trim().length > 0;
  return Array.isArray(content) && content.some((block) => {
    const obj = asRecord(block);
    return obj.type === "text" && typeof obj.text === "string" && obj.text.trim().length > 0;
  });
}

function summarizeResult(item: Record<string, unknown>) {
  const lines = [];
  if (typeof item.result === "string" && item.result.trim()) lines.push(item.result);
  if (typeof item.duration_ms === "number") lines.push(`duration: ${(item.duration_ms / 1000).toFixed(1)}s`);
  return lines.join("\n") || "Completed";
}

function summarizeToolInput(name: string, input: Record<string, unknown>) {
  if (typeof input.command === "string") return input.command;
  if (typeof input.file_path === "string") return shortPath(input.file_path);
  if (typeof input.path === "string") return shortPath(input.path);
  if (typeof input.pattern === "string") return input.pattern;
  if (name === "TodoWrite" && Array.isArray(input.todos)) return `${input.todos.length} todo item(s)`;
  return compactJson(input);
}

function shortPath(value: string) {
  return value.includes("/agent_sessions/") ? value.split("/").pop() || "cadquery.py" : value;
}

function summarizeToolResult(content: unknown) {
  if (typeof content === "string") return truncate(content);
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((block) => {
          const obj = asRecord(block);
          return typeof obj.text === "string" ? obj.text : compactJson(obj);
        })
        .join("\n")
    );
  }
  return truncate(compactJson(content));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function compactJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sanitizeSessionPaths(value: string) {
  return value
    .replace(/\S*\/agent_sessions\/[^\s/]+\/cadquery\.py/g, "cadquery.py")
    .replace(/\S*\/agent_sessions\/[^\s]+/g, "session directory");
}

function truncate(value: string) {
  const sanitized = sanitizeSessionPaths(value);
  return sanitized.length > 1600 ? `${sanitized.slice(0, 1600)}\n...` : sanitized;
}

function AgentRunStatusView({
  status,
  elapsedSeconds,
}: {
  status: AgentRunStatus | null;
  elapsedSeconds: number;
}) {
  const label = status?.label ?? "Agent is working";
  const detail = status?.detail ?? (elapsedSeconds >= 10 ? "Waiting for first Claude Code event" : undefined);

  return (
    <div className="rounded-md border border-border bg-cream px-2.5 py-2 text-xs text-text-secondary">
      <div className="flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="font-mono tabular-nums text-[11px] text-text-secondary/70">
          {formatElapsed(elapsedSeconds)}
        </span>
      </div>
      {detail && <div className="mt-1 pl-5 text-[11px] text-text-secondary/80">{detail}</div>}
    </div>
  );
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function AgentEntryView({ entry }: { entry: AgentEntry }) {
  if (entry.role === "user") {
    return (
      <div className="flex justify-end py-1">
        <div className="max-w-[86%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-sm leading-relaxed text-white shadow-sm">
          <div className="whitespace-pre-wrap break-words">{entry.content}</div>
        </div>
      </div>
    );
  }

  const Icon =
    entry.role === "tool"
      ? Wrench
      : entry.role === "error"
        ? AlertTriangle
        : entry.status === "success"
          ? CheckCircle2
          : entry.role === "system"
            ? Terminal
            : Bot;

  const tone =
    entry.role === "error"
      ? "text-error bg-red-50 border-red-100"
      : entry.status === "success"
        ? "text-primary bg-primary-light border-primary/15"
        : "text-text-secondary bg-cream border-border";

  const contentClass = `rounded-md border px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${tone}`;

  return (
    <div className="flex gap-2.5 py-1.5">
      <div className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-medium text-text-secondary">
          <span className="truncate">{entry.title}</span>
          {entry.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </div>
        {entry.content && entry.role === "agent" && <AgentMarkdown content={entry.content} />}
        {entry.content && entry.role !== "agent" && (
          <pre className={`mt-1 font-sans ${contentClass}`}>
            {entry.content}
          </pre>
        )}
      </div>
    </div>
  );
}

function AgentMarkdown({ content }: { content: string }) {
  return (
    <div className="mt-1 rounded-lg border border-border bg-cream px-3 py-2 text-sm leading-relaxed text-text-primary shadow-sm">
      <div className="prose prose-sm max-w-none text-text-primary [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-cream-dark [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_pre]:my-2 [&_pre]:overflow-x-auto [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-cream-dark [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const inline = !match;
              if (inline) {
                return (
                  <code className="rounded bg-cream-dark px-1 py-0.5 text-xs" {...props}>
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
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
