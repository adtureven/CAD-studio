import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
  toolInput?: string;
  toolOutput?: string;
  streaming?: boolean;
};

type AgentRunStatus = {
  label: string;
  detail?: string;
  startedAt: number;
  updatedAt: number;
};

type ConnectionState = "connecting" | "connected" | "disconnected";

type HandlerCtx = {
  setEntries: Dispatch<SetStateAction<AgentEntry[]>>;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  setRunStatus: Dispatch<SetStateAction<AgentRunStatus | null>>;
  streamingIdRef: RefObject<string | null>;
};

const TOOL_LABELS: Record<string, string> = {
  read_cad: "读取 cadquery.py",
  write_cad: "写入 cadquery.py",
  render_cad: "渲染校验",
};

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
  const streamingIdRef = useRef<string | null>(null);
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
          handleAgentEvent(data, { setEntries, setIsRunning, setRunStatus, streamingIdRef });
        } catch {
          setEntries((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "error",
              title: "事件解析失败",
              content: "无法解析后端发来的 Agent 事件。",
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
        streamingIdRef.current = null;
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
    streamingIdRef.current = null;
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

    streamingIdRef.current = null;
    setEntries((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        title: "你",
        content: message,
      },
    ]);
    setInput("");
    setIsRunning(true);
    setRunStatus(makeRunStatus("启动 Agent", "正在创建隔离的 cadquery.py 会话"));
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
    if (isRunning) return "运行中";
    if (connectionState === "connected") return "就绪";
    if (connectionState === "connecting") return "连接中";
    return "重连中";
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
            <div className="text-sm font-medium truncate">代码智能体</div>
            <div className="text-[11px] text-text-secondary truncate">CAD 智能体 · cadquery.py 会话</div>
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
            <h3 className="text-sm font-medium text-text-primary mb-1">Agent 会话</h3>
            <p className="text-xs leading-relaxed">用自然语言描述你想要的 CAD 模型或修改。</p>
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
            placeholder="让 Agent 编辑 cadquery.py，例如：做一个带四个安装孔的法兰盘"
            rows={3}
            className="w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
          />
          <div className="flex items-center justify-between px-2 py-2 border-t border-border-light">
            <span className="text-[11px] text-text-secondary">Enter 发送 / Shift+Enter 换行</span>
            <button
              onClick={send}
              disabled={!isConnected || isRunning || !input.trim()}
              className="w-7 h-7 rounded-md bg-primary hover:bg-primary-hover text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              title="发送"
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
  ctx: HandlerCtx
) {
  const { setEntries, setIsRunning, setRunStatus, streamingIdRef } = ctx;
  const payload = data.payload ?? {};

  switch (data.type) {
    case "agent_heartbeat":
      setRunStatus((prev) => (prev ? { ...prev, updatedAt: Date.now() } : prev));
      return;

    case "agent_start":
      updateRunStatus(setRunStatus, "启动 Agent", "请求已发送至 Mimo");
      return;

    case "agent_status":
      updateRunStatus(setRunStatus, String(payload.label ?? "处理中"));
      return;

    case "agent_text_delta": {
      const text = String(payload.text ?? "");
      if (!text) return;
      finalizeStreamingIfMissing(streamingIdRef, setEntries);
      const streamingId = streamingIdRef.current;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === streamingId ? { ...e, content: (e.content ?? "") + text } : e
        )
      );
      return;
    }

    case "agent_text_done": {
      const streamingId = streamingIdRef.current;
      streamingIdRef.current = null;
      if (!streamingId) return;
      setEntries((prev) => {
        const target = prev.find((e) => e.id === streamingId);
        if (!target) return prev;
        if (!target.content || !target.content.trim()) {
          return prev.filter((e) => e.id !== streamingId);
        }
        return prev.map((e) => (e.id === streamingId ? { ...e, streaming: false } : e));
      });
      return;
    }

    case "agent_tool_use": {
      streamingIdRef.current = null;
      const toolId = String(payload.id ?? crypto.randomUUID());
      const name = String(payload.name ?? "tool");
      const input = asRecord(payload.input);
      updateRunStatus(setRunStatus, `调用工具：${TOOL_LABELS[name] ?? name}`);
      const { detail } = formatToolInput(name, input);
      setEntries((prev) => [
        ...prev,
        {
          id: `tool-${toolId}`,
          role: "tool",
          title: TOOL_LABELS[name] ?? `调用 ${name}`,
          status: "running",
          toolInput: detail,
        },
      ]);
      return;
    }

    case "agent_tool_result": {
      const toolId = String(payload.id ?? "");
      const isError = Boolean(payload.is_error);
      const output = truncate(String(payload.output ?? ""));
      setEntries((prev) =>
        prev.map((e) =>
          e.id === `tool-${toolId}`
            ? { ...e, status: isError ? "error" : "success", toolOutput: output }
            : e
        )
      );
      return;
    }

    case "agent_code": {
      const code = typeof payload.code === "string" ? payload.code : "";
      if (code) useParameterStore.getState().setCode(code);
      return;
    }

    case "agent_cad_executing": {
      updateRunStatus(setRunStatus, "渲染 cadquery.py", "正在执行 CadQuery");
      useParameterStore.getState().setExecuting(true);
      useViewportStore.getState().setLoading(true);
      return;
    }

    case "agent_cad_result": {
      const modelUrl = typeof payload.model_url === "string" ? payload.model_url : "";
      const format = payload.format === "gltf" ? "gltf" : "step";
      const parameterStore = useParameterStore.getState();
      const viewportStore = useViewportStore.getState();
      const parameters = Array.isArray(payload.parameters) ? (payload.parameters as ParameterDef[]) : [];

      parameterStore.setExecuting(false);
      parameterStore.setParameters(parameters);

      if (!modelUrl) {
        viewportStore.setError("CAD 后端未返回模型 URL");
        return;
      }

      viewportStore.setModelUrl(modelUrl, format);
      useLibraryStore.getState().addModel({
        name: "智能体模型",
        code: parameterStore.currentCode,
        modelUrl,
        format,
      });
      return;
    }

    case "agent_cad_error": {
      const error = String(payload.error ?? "CAD 执行失败");
      useParameterStore.getState().setExecuting(false);
      useViewportStore.getState().setError(error);
      return;
    }

    case "agent_repair_start": {
      setIsRunning(true);
      const attempt = Number(payload.attempt ?? 1);
      const maxAttempts = Number(payload.max_attempts ?? attempt);
      updateRunStatus(
        setRunStatus,
        `自动修复中（${attempt}/${maxAttempts}）`,
        "正在把渲染错误反馈给 Agent"
      );
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          title: `自动修复（${attempt}/${maxAttempts}）`,
          content: String(payload.error ?? ""),
        },
      ]);
      return;
    }

    case "agent_done": {
      streamingIdRef.current = null;
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
          title: "Agent 异常退出",
          content: `退出码 ${String(payload.return_code ?? "未知")}`,
          status: "error",
        },
      ]);
      return;
    }

    case "agent_error": {
      streamingIdRef.current = null;
      const message = String(payload.message ?? payload.content ?? "");
      setIsRunning(false);
      setRunStatus(null);
      useParameterStore.getState().setExecuting(false);
      useViewportStore.getState().setError(message || "Agent 错误");
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "error",
          title: "Agent 错误",
          content: message,
          status: "error",
        },
      ]);
      return;
    }

    default:
      return;
  }
}

function finalizeStreamingIfMissing(
  streamingIdRef: RefObject<string | null>,
  setEntries: Dispatch<SetStateAction<AgentEntry[]>>
) {
  if (streamingIdRef.current) return;
  const id = crypto.randomUUID();
  streamingIdRef.current = id;
  setEntries((prev) => [
    ...prev,
    { id, role: "agent", title: "Agent", content: "", streaming: true },
  ]);
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

function formatToolInput(name: string, input: Record<string, unknown>): { detail?: string } {
  if (name === "write_cad" && typeof input.content === "string") {
    return { detail: truncate(input.content) };
  }
  if (Object.keys(input).length === 0) {
    return { detail: undefined };
  }
  return { detail: truncate(compactJson(input)) };
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
    .replace(/\S*\/agent_sessions\/[^\s]+/g, "会话目录");
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
  const label = status?.label ?? "Agent 工作中";
  const detail = status?.detail ?? (elapsedSeconds >= 10 ? "正在等待 Agent 输出" : undefined);

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

  if (entry.role === "tool") {
    return <ToolEntryView entry={entry} />;
  }

  const Icon =
    entry.role === "error"
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
          {entry.streaming && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </div>
        {entry.role === "agent" && (entry.content || entry.streaming) && (
          <AgentMarkdown content={entry.content ?? ""} />
        )}
        {entry.content && entry.role !== "agent" && (
          <pre className={`mt-1 font-sans ${contentClass}`}>{entry.content}</pre>
        )}
      </div>
    </div>
  );
}

function ToolEntryView({ entry }: { entry: AgentEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.toolInput || entry.toolOutput);

  const tone =
    entry.status === "error"
      ? "text-error bg-red-50 border-red-100"
      : entry.status === "success"
        ? "text-primary bg-primary-light border-primary/15"
        : "text-text-secondary bg-cream border-border";

  return (
    <div className="flex gap-2.5 py-1.5">
      <div className={`mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ${tone}`}>
        {entry.status === "success" ? (
          <CheckCircle2 className="w-3.5 h-3.5" />
        ) : entry.status === "error" ? (
          <AlertTriangle className="w-3.5 h-3.5" />
        ) : (
          <Wrench className="w-3.5 h-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => hasDetail && setOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-[11px] font-medium text-text-secondary ${
            hasDetail ? "cursor-pointer hover:text-text-primary" : "cursor-default"
          }`}
        >
          {hasDetail &&
            (open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          <span className="truncate">{entry.title}</span>
          {entry.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
        </button>
        {open && entry.toolInput && (
          <div className="mt-1">
            <div className="text-[10px] uppercase tracking-wide text-text-secondary/60 mb-0.5">输入</div>
            <pre className="rounded-md border border-border bg-cream px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words overflow-x-auto">
              {entry.toolInput}
            </pre>
          </div>
        )}
        {open && entry.toolOutput && (
          <div className="mt-1">
            <div className="text-[10px] uppercase tracking-wide text-text-secondary/60 mb-0.5">输出</div>
            <pre
              className={`rounded-md border px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words overflow-x-auto ${
                entry.status === "error"
                  ? "text-error bg-red-50 border-red-100"
                  : "text-text-secondary bg-cream border-border"
              }`}
            >
              {entry.toolOutput}
            </pre>
          </div>
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
