import { create } from "zustand";
import type { ParameterDef } from "@/types/model";

interface ParameterStore {
  parameters: ParameterDef[];
  currentCode: string;
  isExecuting: boolean;

  setParameters: (params: ParameterDef[]) => void;
  updateParameter: (name: string, value: number | string | boolean) => void;
  setCode: (code: string) => void;
  setExecuting: (executing: boolean) => void;
}

export const useParameterStore = create<ParameterStore>((set) => ({
  parameters: [],
  currentCode: "",
  isExecuting: false,

  setParameters: (params) => set({ parameters: params }),

  updateParameter: (name, value) =>
    set((state) => ({
      parameters: state.parameters.map((p) =>
        p.name === name ? { ...p, current_value: value } : p
      ),
    })),

  setCode: (code) => set({ currentCode: code }),
  setExecuting: (executing) => set({ isExecuting: executing }),
}));
