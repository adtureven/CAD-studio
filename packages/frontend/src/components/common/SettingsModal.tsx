import { useState, useEffect } from "react";
import { X, Eye, EyeOff, Loader2, Palette, RotateCcw } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { DEFAULT_MODEL_APPEARANCE, useAppearanceStore } from "@/stores/appearanceStore";

interface SettingsData {
  gateway_url: string;
  gateway_api_key: string;
  gateway_models: string;
  agent_base_url: string;
  default_model: string;
}

export function SettingsModal() {
  const { settingsOpen, toggleSettings } = useUIStore();
  const {
    modelColor,
    roughness,
    metalness,
    setModelColor,
    setRoughness,
    setMetalness,
    resetAppearance,
  } = useAppearanceStore();
  const [data, setData] = useState<SettingsData>({
    gateway_url: "",
    gateway_api_key: "",
    gateway_models: "",
    agent_base_url: "",
    default_model: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    if (settingsOpen) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => setData(d))
        .catch(() => {});
    }
  }, [settingsOpen]);

  if (!settingsOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setData(updated);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={toggleSettings} />
      <div className="relative bg-surface rounded-xl shadow-xl border border-border w-full max-w-md mx-4 max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-serif font-semibold text-text-primary">Settings</h2>
          <button
            onClick={toggleSettings}
            className="p-1.5 rounded-md hover:bg-cream-dark text-text-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                Model Appearance
              </h3>
              <button
                type="button"
                onClick={resetAppearance}
                className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-cream-dark transition-colors"
                title="Reset appearance"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1">Model Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={modelColor}
                  onChange={(e) => setModelColor(e.target.value)}
                  className="h-9 w-12 rounded-md border border-border bg-cream p-1"
                  title="Model color"
                />
                <input
                  type="text"
                  value={modelColor}
                  onChange={(e) => setModelColor(e.target.value)}
                  placeholder={DEFAULT_MODEL_APPEARANCE.modelColor}
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                />
              </div>
            </div>

            <MaterialSlider
              label="Roughness"
              value={roughness}
              onChange={setRoughness}
            />
            <MaterialSlider
              label="Metalness"
              value={metalness}
              onChange={setMetalness}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              AI API Configuration
            </h3>

            <div>
              <label className="block text-sm text-text-primary mb-1">API URL</label>
              <input
                type="url"
                value={data.gateway_url}
                onChange={(e) => setData({ ...data, gateway_url: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <p className="text-xs text-text-secondary/70 mt-1">OpenAI-compatible endpoint</p>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={data.gateway_api_key}
                  onChange={(e) => setData({ ...data, gateway_api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1">Models</label>
              <input
                type="text"
                value={data.gateway_models}
                onChange={(e) => setData({ ...data, gateway_models: e.target.value })}
                placeholder="gpt-4o, claude-3-5-sonnet"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <p className="text-xs text-text-secondary/70 mt-1">Comma-separated model names</p>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1">Default Model</label>
              <input
                type="text"
                value={data.default_model}
                onChange={(e) => setData({ ...data, default_model: e.target.value })}
                placeholder="model-id"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <p className="text-xs text-text-secondary/70 mt-1">默认选中的模型</p>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1">Agent Base URL</label>
              <input
                type="url"
                value={data.agent_base_url}
                onChange={(e) => setData({ ...data, agent_base_url: e.target.value })}
                placeholder="https://.../anthropic"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-cream focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <p className="text-xs text-text-secondary/70 mt-1">Agent 模式使用的 Anthropic 兼容端点</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-xs">
            {status === "saved" && <span className="text-green-600">Saved successfully</span>}
            {status === "error" && <span className="text-red-600">Failed to save</span>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleSettings}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-cream-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-text-primary">{label}</label>
        <span className="text-xs text-text-secondary font-mono">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-cream-dark rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}
