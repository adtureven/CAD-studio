import { useCallback, useRef, useEffect } from "react";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function ResizeHandle({ onResize, onDragStart, onDragEnd }: ResizeHandleProps) {
  const onResizeRef = useRef(onResize);
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => {
    onResizeRef.current = onResize;
    onDragStartRef.current = onDragStart;
    onDragEndRef.current = onDragEnd;
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let lastX = e.clientX;
    onDragStartRef.current?.();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const delta = moveEvent.clientX - lastX;
      if (delta !== 0) {
        lastX = moveEvent.clientX;
        onResizeRef.current(delta);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onDragEndRef.current?.();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="w-[5px] flex-shrink-0 cursor-col-resize relative group z-10"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-border group-hover:bg-primary/40 group-active:bg-primary transition-colors" />
      <div className="absolute inset-y-0 -left-[4px] -right-[4px]" />
    </div>
  );
}
