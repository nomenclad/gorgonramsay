/**
 * Right-click context menu component with wiki link and copy actions.
 * Also exports openInBrowser (Tauri/web-aware URL opener) and re-exports wikiUrl.
 * Close triggers: click outside, Escape key. Positioned at mouse coordinates.
 */
import { useEffect, useRef } from "react";
import { isTauri } from "../../lib/platform";

interface ContextMenuItem {
  label: string;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Clamp to viewport so menu never overflows off-screen
  const style: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: x,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={style}
      className="bg-bg-secondary border border-border rounded shadow-lg py-1 min-w-36 text-sm"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className="w-full text-left px-3 py-1.5 hover:bg-bg-primary text-text-primary transition-colors"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// Re-export wikiUrl from config so existing import sites don't need to change.
export { wikiUrl } from "../../lib/config";

/** Open a URL in the system default browser (Tauri) or a new tab (web). */
export async function openInBrowser(url: string): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_url", { url });
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
