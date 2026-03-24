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

/** Build the wiki URL for an item or recipe by display name. */
export function wikiUrl(name: string): string {
  // PG wiki: https://wiki.projectgorgon.com/wiki/Item_Name
  const slug = name.trim().replace(/ /g, "_");
  return `https://wiki.projectgorgon.com/wiki/${encodeURIComponent(slug)}`;
}

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
