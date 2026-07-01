import { create } from "zustand";
import type { ParameterDef } from "@/types/model";

export interface SavedModel {
  id: string;
  name: string;
  code: string;
  modelUrl: string;
  format: "step" | "gltf";
  parameters: ParameterDef[];
  sourcePrompt?: string;
  createdAt: number;
}

interface LibraryStore {
  savedModels: SavedModel[];
  activeSavedModelId: string | null;
  addModel: (model: Omit<SavedModel, "id" | "createdAt">) => string;
  updateModel: (id: string, patch: Partial<Omit<SavedModel, "id" | "createdAt">>) => void;
  removeModel: (id: string) => void;
  setActiveSavedModel: (id: string | null) => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  savedModels: [],
  activeSavedModelId: null,

  addModel: (model) => {
    const id = crypto.randomUUID();
    set((state) => ({
      savedModels: [
        {
          ...model,
          id,
          createdAt: Date.now(),
        },
        ...state.savedModels,
      ],
      activeSavedModelId: id,
    }));
    return id;
  },

  updateModel: (id, patch) =>
    set((state) => ({
      savedModels: state.savedModels.map((model) =>
        model.id === id ? { ...model, ...patch } : model
      ),
    })),

  removeModel: (id) =>
    set((state) => ({
      savedModels: state.savedModels.filter((m) => m.id !== id),
      activeSavedModelId:
        state.activeSavedModelId === id ? null : state.activeSavedModelId,
    })),

  setActiveSavedModel: (id) => set({ activeSavedModelId: id }),
}));
