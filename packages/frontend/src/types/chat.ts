export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  images?: string[];
  code?: string;
  timestamp: number;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface StreamEvent {
  type:
    | "thinking_chunk"
    | "response_chunk"
    | "code_generated"
    | "cad_executing"
    | "cad_result"
    | "cad_error"
    | "fix_start"
    | "fix_failed"
    | "done"
    | "error";
  payload: Record<string, unknown>;
}
