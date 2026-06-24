import { create } from "zustand";
import type { ChatMessage, Conversation } from "@/types/chat";

interface ChatStore {
  conversations: Map<string, Conversation>;
  activeConversationId: string | null;
  isStreaming: boolean;
  currentThinking: string;
  currentResponse: string;
  selectedModel: string;

  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  addUserMessage: (content: string, images?: string[]) => void;
  appendThinkingChunk: (chunk: string) => void;
  appendResponseChunk: (chunk: string) => void;
  setCode: (code: string) => void;
  finalizeMessage: (usage?: Record<string, number>) => void;
  setModel: (model: string) => void;
  setStreaming: (streaming: boolean) => void;
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: new Map(),
  activeConversationId: null,
  isStreaming: false,
  currentThinking: "",
  currentResponse: "",
  selectedModel: "mimo-v2.5-pro",

  createConversation: () => {
    const id = crypto.randomUUID();
    const conversation: Conversation = {
      id,
      title: "New Conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => {
      const conversations = new Map(state.conversations);
      conversations.set(id, conversation);
      return { conversations, activeConversationId: id };
    });
    return id;
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addUserMessage: (content, images) => {
    const state = get();
    let conversationId = state.activeConversationId;
    if (!conversationId) {
      conversationId = state.createConversation();
    }

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        images: images?.length ? [...images] : undefined,
        timestamp: Date.now(),
      };

    set((state) => {
      const conversations = new Map(state.conversations);
      const conv = conversations.get(conversationId!);
      if (conv) {
        conv.messages = [...conv.messages, message];
        conv.updatedAt = Date.now();
        if (conv.messages.length === 1) {
          conv.title = content.slice(0, 50);
        }
      }
      return {
        conversations,
        isStreaming: true,
        currentThinking: "",
        currentResponse: "",
      };
    });
  },

  appendThinkingChunk: (chunk) =>
    set((state) => ({ currentThinking: state.currentThinking + chunk, isStreaming: true })),

  appendResponseChunk: (chunk) =>
    set((state) => ({ currentResponse: state.currentResponse + chunk, isStreaming: true })),

  setCode: (_code) => {},

  finalizeMessage: () => {
    const state = get();
    const conversationId = state.activeConversationId;
    if (!conversationId) return;

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: state.currentResponse,
      thinking: state.currentThinking || undefined,
      timestamp: Date.now(),
      model: state.selectedModel,
    };

    set((state) => {
      const conversations = new Map(state.conversations);
      const conv = conversations.get(conversationId);
      if (conv) {
        conv.messages = [...conv.messages, message];
        conv.updatedAt = Date.now();
      }
      return {
        conversations,
        isStreaming: false,
        currentThinking: "",
        currentResponse: "",
      };
    });
  },

  setModel: (model) => set({ selectedModel: model }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),

  getActiveConversation: () => {
    const state = get();
    if (!state.activeConversationId) return undefined;
    return state.conversations.get(state.activeConversationId);
  },
}));
