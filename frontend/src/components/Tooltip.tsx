import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 8 });
  }, []);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
      {children}
      {pos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -100%)",
              background: "#1E293B",
              color: "var(--text-primary)",
              fontSize: "0.75rem",
              fontWeight: 400,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--bg-card-border)",
              whiteSpace: "normal",
              maxWidth: 220,
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 99999,
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
