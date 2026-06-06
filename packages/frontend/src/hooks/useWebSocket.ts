import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useParameterStore } from "@/stores/parameterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import type { StreamEvent } from "@/types/chat";
import type { ParameterDef } from "@/types/model";
import { getBackendWsUrl } from "@/utils/backendWs";

const WS_URL = getBackendWsUrl("/api/chat/ws");

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      const data: StreamEvent = JSON.parse(event.data);
      handleMessage(data);
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected, reconnecting...");
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (message: string, images?: string[]) => {
      const chatStore = useChatStore.getState();
      let conversationId = chatStore.activeConversationId;
      if (!conversationId) {
        conversationId = chatStore.createConversation();
      }

      chatStore.addUserMessage(message, images);

      const conversation = chatStore.conversations.get(conversationId);
      const history =
        conversation?.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.content })) ?? [];

      wsRef.current?.send(
        JSON.stringify({
          type: "chat_request",
          payload: {
            conversation_id: conversationId,
            message,
            images: images || [],
            model: chatStore.selectedModel,
            enable_thinking: true,
            history,
          },
        })
      );
    },
    []
  );

  const updateParameters = useCallback(
    (code: string, parameters: Record<string, number | string | boolean>) => {
      const conversationId =
        useChatStore.getState().activeConversationId || "default";
      useViewportStore.getState().setLoading(true);

      wsRef.current?.send(
        JSON.stringify({
          type: "param_update",
          payload: {
            conversation_id: conversationId,
            code,
            parameters,
          },
        })
      );
    },
    []
  );

  return { sendMessage, updateParameters };
}

function handleMessage(event: StreamEvent) {
  const chatStore = useChatStore.getState();
  const viewportStore = useViewportStore.getState();
  const parameterStore = useParameterStore.getState();

  switch (event.type) {
    case "thinking_chunk":
      chatStore.appendThinkingChunk(event.payload.content as string);
      break;

    case "response_chunk":
      chatStore.appendResponseChunk(event.payload.content as string);
      break;

    case "code_generated":
      parameterStore.setCode(event.payload.code as string);
      break;

    case "cad_executing":
      viewportStore.setLoading(true);
      break;

    case "cad_result": {
      const modelUrl = event.payload.model_url as string;
      const format = (event.payload.format as "gltf" | "step") || "step";
      viewportStore.setModelUrl(modelUrl, format);
      parameterStore.setParameters(
        event.payload.parameters as ParameterDef[]
      );
      const code = parameterStore.currentCode;
      const convTitle = chatStore.getActiveConversation()?.title || "模型";
      useLibraryStore.getState().addModel({
        name: convTitle.slice(0, 30),
        code,
        modelUrl,
        format,
      });
      break;
    }

    case "cad_error":
      viewportStore.setError(event.payload.error as string);
      break;

    case "fix_start": {
      const attempt = event.payload.attempt as number;
      const maxAttempts = event.payload.max_attempts as number;
      const fixError = event.payload.error as string;
      const shortErr = fixError.includes("\n")
        ? fixError.split("\n").filter((l: string) => l.trim()).pop() || fixError
        : fixError;
      chatStore.finalizeMessage();
      chatStore.appendResponseChunk(
        `**自动修复（${attempt}/${maxAttempts}）**\n\n错误：\`${shortErr}\`\n\n正在重试...\n\n`
      );
      viewportStore.setLoading(true);
      break;
    }

    case "fix_failed": {
      const failError = event.payload.error as string;
      chatStore.finalizeMessage();
      chatStore.appendResponseChunk(
        `**多次修复均失败**\n\n\`\`\`\n${failError}\n\`\`\`\n\n请尝试换一种描述方式，或简化模型几何。`
      );
      viewportStore.setLoading(false);
      break;
    }

    case "done":
      chatStore.finalizeMessage();
      break;

    case "error":
      chatStore.setStreaming(false);
      viewportStore.setError(event.payload.message as string);
      break;
  }
}
