import { Canvas3D } from "../viewport/Canvas3D";
import { useViewportStore } from "@/stores/viewportStore";
import { RotateCcw, Maximize2, Download, Camera, Box } from "lucide-react";

export function MainViewport() {
  const { isLoading, error, modelUrl, actions } = useViewportStore();

  const handleExport = () => {
    if (!modelUrl) return;
    const link = document.createElement("a");
    link.href = modelUrl;
    link.download = `model${modelUrl.endsWith(".step") ? ".step" : ".gltf"}`;
    link.click();
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 relative min-h-0">
        <Canvas3D />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream/60 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-text-secondary">
                Generating model...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute bottom-16 left-4 right-4 bg-red-50 border border-red-200 rounded-lg p-3 z-10">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <ViewCube onSetView={(dir) => actions.setViewAngle?.(dir)} />

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface rounded-lg shadow-md px-2 py-1.5 border border-border z-10">
          <ToolbarButton icon={RotateCcw} label="Reset View" onClick={() => actions.resetView?.()} />
          <ToolbarButton icon={Maximize2} label="Fit" onClick={() => actions.fitModel?.()} />
          <div className="w-px h-5 bg-border" />
          <ToolbarButton icon={Camera} label="Screenshot" onClick={() => actions.screenshot?.()} />
          <ToolbarButton icon={Download} label="Export" onClick={handleExport} disabled={!modelUrl} />
        </div>
      </div>
    </div>
  );
}

function ViewCube({
  onSetView,
}: {
  onSetView: (dir: "front" | "back" | "left" | "right" | "top" | "bottom" | "iso") => void;
}) {
  const views: { label: string; dir: "front" | "back" | "left" | "right" | "top" | "bottom" | "iso" }[] = [
    { label: "前", dir: "front" },
    { label: "后", dir: "back" },
    { label: "左", dir: "left" },
    { label: "右", dir: "right" },
    { label: "顶", dir: "top" },
    { label: "底", dir: "bottom" },
  ];

  return (
    <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-1">
      <button
        onClick={() => onSetView("iso")}
        className="w-8 h-8 rounded-md bg-surface border border-border shadow-sm flex items-center justify-center text-text-secondary hover:text-primary hover:border-primary/30 transition-colors"
        title="Isometric"
      >
        <Box className="w-4 h-4" />
      </button>
      <div className="grid grid-cols-3 gap-0.5 bg-surface rounded-lg border border-border shadow-sm p-1">
        {/* Row 1: Top */}
        <div />
        <ViewBtn label={views[4]!.label} onClick={() => onSetView("top")} />
        <div />
        {/* Row 2: Left, Front, Right */}
        <ViewBtn label={views[2]!.label} onClick={() => onSetView("left")} />
        <ViewBtn label={views[0]!.label} onClick={() => onSetView("front")} highlight />
        <ViewBtn label={views[3]!.label} onClick={() => onSetView("right")} />
        {/* Row 3: Bottom */}
        <div />
        <ViewBtn label={views[5]!.label} onClick={() => onSetView("bottom")} />
        <div />
      </div>
      <button
        onClick={() => onSetView("back")}
        className="w-8 h-8 rounded-md bg-surface border border-border shadow-sm flex items-center justify-center text-[10px] font-medium text-text-secondary hover:text-primary hover:border-primary/30 transition-colors"
        title="Back"
      >
        后
      </button>
    </div>
  );
}

function ViewBtn({ label, onClick, highlight }: { label: string; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-medium transition-colors ${
        highlight
          ? "bg-primary/10 text-primary hover:bg-primary/20"
          : "text-text-secondary hover:text-primary hover:bg-cream-dark"
      }`}
      title={label}
    >
      {label}
    </button>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
        disabled
          ? "text-text-secondary/40 cursor-not-allowed"
          : "text-text-secondary hover:text-text-primary hover:bg-cream-dark"
      }`}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
}
