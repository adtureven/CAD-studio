import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_MODEL_APPEARANCE = {
  modelColor: "#5C7C5E",
  roughness: 0.35,
  metalness: 0.1,
};

interface AppearanceStore {
  modelColor: string;
  roughness: number;
  metalness: number;
  setModelColor: (color: string) => void;
  setRoughness: (roughness: number) => void;
  setMetalness: (metalness: number) => void;
  resetAppearance: () => void;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export const useAppearanceStore = create<AppearanceStore>()(
  persist(
    (set) => ({
      ...DEFAULT_MODEL_APPEARANCE,
      setModelColor: (modelColor) => {
        if (isHexColor(modelColor)) set({ modelColor });
      },
      setRoughness: (roughness) => set({ roughness: clamp01(roughness) }),
      setMetalness: (metalness) => set({ metalness: clamp01(metalness) }),
      resetAppearance: () => set(DEFAULT_MODEL_APPEARANCE),
    }),
    {
      name: "cad-ai-model-appearance",
      merge: (persisted, current) => {
        const value = (persisted ?? {}) as Partial<AppearanceStore>;
        return {
          ...current,
          ...value,
          modelColor: isHexColor(value.modelColor ?? "")
            ? value.modelColor!
            : current.modelColor,
          roughness: clamp01(value.roughness ?? current.roughness),
          metalness: clamp01(value.metalness ?? current.metalness),
        };
      },
    }
  )
);
