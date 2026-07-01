import { useCallback, useRef } from "react";
import { useParameterStore } from "@/stores/parameterStore";
import { useViewportStore } from "@/stores/viewportStore";
import { useLibraryStore } from "@/stores/libraryStore";
import type { ParameterDef } from "@/types/model";
import { Sliders } from "lucide-react";

interface ParameterPanelProps {
  onUpdateParameters: (
    code: string,
    parameters: Record<string, number | string | boolean>
  ) => void;
}

export function ParameterPanel({ onUpdateParameters }: ParameterPanelProps) {
  const { parameters, currentCode, updateParameter } = useParameterStore();
  const hoveredFaceId = useViewportStore((s) => s.hoveredFaceId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (name: string, value: number | string | boolean) => {
      updateParameter(name, value);
      const targetSavedModelId = useLibraryStore.getState().activeSavedModelId;
      if (targetSavedModelId) {
        useLibraryStore.getState().updateModel(targetSavedModelId, {
          parameters: cloneParameters(useParameterStore.getState().parameters),
        });
      }

      const { previewModelId, modelUrl } = useViewportStore.getState();
      if (previewModelId) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const params = useParameterStore.getState().parameters;
        const paramValues: Record<string, number | string | boolean> = {};
        for (const p of params) {
          paramValues[p.name] = p.current_value;
        }

        if (modelUrl) {
          useViewportStore.getState().setLoading(true);
          try {
            const res = await fetch("/api/cad/update-params", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: useParameterStore.getState().currentCode,
                parameters: paramValues,
              }),
            });
            const data = await res.json();
            if (data.success && data.model_url) {
              useViewportStore
                .getState()
                .setModelUrl(data.model_url, data.format || "step");
              if (targetSavedModelId) {
                useLibraryStore.getState().updateModel(targetSavedModelId, {
                  modelUrl: data.model_url,
                  format: data.format || "step",
                  parameters: cloneParameters(params),
                });
              }
            }
          } catch {
            useViewportStore.getState().setLoading(false);
          }
        } else {
          onUpdateParameters(currentCode, paramValues);
        }
      }, 600);
    },
    [currentCode, onUpdateParameters, updateParameter]
  );

  if (parameters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <Sliders className="w-8 h-8 text-text-secondary/40 mb-2" />
        <p className="text-sm text-text-secondary">No parameters yet</p>
        <p className="text-xs text-text-secondary/70 mt-1">
          Generate a model to see editable parameters
        </p>
      </div>
    );
  }

  const groups = groupParameters(parameters);

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, params]) => (
        <div
          key={group}
          className={`rounded-lg transition-colors ${
            hoveredFaceId !== null
              ? "bg-primary-light/50 border border-primary/20 p-2 -mx-2"
              : ""
          }`}
        >
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            {group}
          </h3>
          <div className="space-y-3">
            {params.map((param) => (
              <ParameterField
                key={param.name}
                param={param}
                onChange={handleChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function cloneParameters(parameters: ParameterDef[]) {
  return parameters.map((p) => ({ ...p }));
}

function ParameterField({
  param,
  onChange,
}: {
  param: ParameterDef;
  onChange: (name: string, value: number | string | boolean) => void;
}) {
  if (param.type === "boolean") {
    return (
      <label className="flex items-center justify-between">
        <span className="text-sm text-text-primary">{param.label}</span>
        <input
          type="checkbox"
          checked={param.current_value as boolean}
          onChange={(e) => onChange(param.name, e.target.checked)}
          className="w-4 h-4 accent-primary"
        />
      </label>
    );
  }

  if (param.type === "number" || param.type === "integer") {
    const numValue = Number(param.current_value);
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-text-primary">{param.label}</span>
          <span className="text-xs text-text-secondary font-mono">
            {numValue.toFixed(param.type === "integer" ? 0 : 1)}
          </span>
        </div>
        {param.min !== undefined && param.max !== undefined ? (
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step || (param.type === "integer" ? 1 : 0.1)}
            value={numValue}
            onChange={(e) => onChange(param.name, Number(e.target.value))}
            className="w-full h-1.5 bg-cream-dark rounded-full appearance-none cursor-pointer accent-primary"
          />
        ) : (
          <input
            type="number"
            value={numValue}
            step={param.step || 1}
            onChange={(e) => onChange(param.name, Number(e.target.value))}
            className="w-full px-2 py-1 text-sm border border-border rounded-md bg-cream"
          />
        )}
      </div>
    );
  }

  if (param.type === "enum" && param.options) {
    return (
      <div>
        <span className="text-sm text-text-primary block mb-1">
          {param.label}
        </span>
        <select
          value={param.current_value as string}
          onChange={(e) => onChange(param.name, e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-cream"
        >
          {param.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <span className="text-sm text-text-primary block mb-1">
        {param.label}
      </span>
      <input
        type="text"
        value={param.current_value as string}
        onChange={(e) => onChange(param.name, e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-cream"
      />
    </div>
  );
}

function groupParameters(
  params: ParameterDef[]
): Record<string, ParameterDef[]> {
  const groups: Record<string, ParameterDef[]> = {};
  for (const param of params) {
    const group = param.group || "General";
    if (!groups[group]) groups[group] = [];
    groups[group].push(param);
  }
  return groups;
}
