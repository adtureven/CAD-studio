import { create } from "zustand";

export interface SavedModel {
  id: string;
  name: string;
  code: string;
  modelUrl: string;
  format: "step" | "gltf";
  createdAt: number;
}

interface LibraryStore {
  savedModels: SavedModel[];
  addModel: (model: Omit<SavedModel, "id" | "createdAt">) => void;
  removeModel: (id: string) => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  savedModels: [],

  addModel: (model) =>
    set((state) => ({
      savedModels: [
        {
          ...model,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        },
        ...state.savedModels,
      ],
    })),

  removeModel: (id) =>
    set((state) => ({
      savedModels: state.savedModels.filter((m) => m.id !== id),
    })),
}));
