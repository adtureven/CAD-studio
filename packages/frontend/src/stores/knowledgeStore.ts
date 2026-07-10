import { create } from "zustand";

export interface KnowledgeDoc {
  doc_id: string;
  filename: string;
  pages: number;
  chunks: number;
  uploaded_at: number;
  size_bytes: number;
}

export interface KnowledgeHit {
  chunk_id: string;
  score: number;
  doc_id: string;
  filename: string;
  page: number;
  heading: string;
  text: string;
}

interface KnowledgeStore {
  docs: KnowledgeDoc[];
  loading: boolean;
  uploading: boolean;
  uploadError: string | null;
  lastHits: KnowledgeHit[];
  lastQuery: string;

  refresh: () => Promise<void>;
  upload: (file: File) => Promise<void>;
  remove: (docId: string) => Promise<void>;
  search: (query: string, topK?: number) => Promise<KnowledgeHit[]>;
  setLastHits: (query: string, hits: KnowledgeHit[]) => void;
}

const API = "/api/knowledge";

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  docs: [],
  loading: false,
  uploading: false,
  uploadError: null,
  lastHits: [],
  lastQuery: "",

  refresh: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API}/docs`);
      const data = await res.json();
      set({ docs: data.docs ?? [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  upload: async (file: File) => {
    set({ uploading: true, uploadError: null });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "上传失败" }));
        throw new Error(err.detail ?? "上传失败");
      }
      await get().refresh();
    } catch (e) {
      set({ uploadError: e instanceof Error ? e.message : "上传失败" });
    } finally {
      set({ uploading: false });
    }
  },

  remove: async (docId: string) => {
    await fetch(`${API}/docs/${encodeURIComponent(docId)}`, { method: "DELETE" });
    await get().refresh();
  },

  search: async (query: string, topK = 5) => {
    const res = await fetch(`${API}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits: KnowledgeHit[] = data.hits ?? [];
    set({ lastHits: hits, lastQuery: query });
    return hits;
  },

  setLastHits: (query, hits) => set({ lastQuery: query, lastHits: hits }),
}));
