import { create } from "zustand";

interface ViewportActions {
  resetView?: () => void;
  fitModel?: () => void;
  screenshot?: () => void;
  setViewAngle?: (direction: "front" | "back" | "left" | "right" | "top" | "bottom" | "iso") => void;
}

interface ViewportStore {
  modelUrl: string | null;
  modelFormat: "gltf" | "step" | null;
  previewModelId: string | null;
  isLoading: boolean;
  error: string | null;
  actions: ViewportActions;
  hoveredFaceId: number | null;
  hoveredGroup: string | null;

  setModelUrl: (url: string, format?: "gltf" | "step") => void;
  setPreviewModelId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActions: (actions: ViewportActions) => void;
  setHoveredFace: (faceId: number | null, group?: string | null) => void;
  clear: () => void;
}

export const useViewportStore = create<ViewportStore>((set) => ({
  modelUrl: null,
  modelFormat: null,
  previewModelId: null,
  isLoading: false,
  error: null,
  actions: {},
  hoveredFaceId: null,
  hoveredGroup: null,

  setModelUrl: (url, format) => {
    const detected = format || (url.endsWith(".step") ? "step" : "gltf");
    set({ modelUrl: url || null, modelFormat: detected, previewModelId: null, isLoading: false, error: null });
  },
  setPreviewModelId: (id) => set({ previewModelId: id, modelUrl: null, modelFormat: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  setActions: (actions) => set({ actions }),
  setHoveredFace: (faceId, group) => set({ hoveredFaceId: faceId, hoveredGroup: group ?? null }),
  clear: () => set({ modelUrl: null, modelFormat: null, previewModelId: null, isLoading: false, error: null, hoveredFaceId: null, hoveredGroup: null }),
}));
