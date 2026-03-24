import { useState, useRef } from "react";
import { ActionBar } from "../common/ActionBar";

export interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  defaultTabs: Tab[];
  loadTabOrder: () => Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function TabBar({ defaultTabs, loadTabOrder, activeTab, onTabChange }: TabBarProps) {
  const [tabs, setTabs] = useState<Tab[]>(() => loadTabOrder());
  const [unlocked, setUnlocked] = useState(false);

  // Pointer-based drag state (no HTML5 drag API which is unreliable in Tauri)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [targetIdx, setTargetIdx] = useState<number | null>(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, i: number) {
    if (!unlocked) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIdx(i);
    setTargetIdx(i);
    setGhostPos({ x: e.clientX, y: e.clientY });
  }

  function moveDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragIdx === null) return;
    setGhostPos({ x: e.clientX, y: e.clientY });

    // Find which tab slot the pointer is over
    for (let j = 0; j < tabRefs.current.length; j++) {
      const ref = tabRefs.current[j];
      if (!ref) continue;
      const rect = ref.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        setTargetIdx(j);
        break;
      }
    }
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragIdx !== null && targetIdx !== null && dragIdx !== targetIdx) {
      const next = [...tabs];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      setTabs(next);
      localStorage.setItem("tabOrder", JSON.stringify(next.map((t) => t.id)));
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragIdx(null);
    setTargetIdx(null);
  }

  function resetOrder() {
    setTabs(defaultTabs);
    localStorage.removeItem("tabOrder");
  }

  const ghostTab = dragIdx !== null ? tabs[dragIdx] : null;

  return (
    <nav className="bg-bg-secondary border-b border-border relative select-none">
      <div className="flex items-center w-full">
        {tabs.map((tab, i) => {
          const isDragging = dragIdx === i;
          const isTarget = targetIdx === i && dragIdx !== null && dragIdx !== i;

          return (
            <button
              key={tab.id}
              ref={(el) => { tabRefs.current[i] = el; }}
              onClick={() => {
                if (!unlocked && dragIdx === null) onTabChange(tab.id);
              }}
              onPointerDown={unlocked ? (e) => startDrag(e, i) : undefined}
              onPointerMove={unlocked ? (e) => moveDrag(e) : undefined}
              onPointerUp={unlocked ? (e) => endDrag(e) : undefined}
              onPointerCancel={unlocked ? (e) => endDrag(e) : undefined}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                unlocked
                  ? isDragging
                    ? "opacity-25 border-dashed border-accent/60 text-text-muted cursor-grabbing"
                    : isTarget
                    ? "border-accent text-accent bg-accent/10 cursor-grab"
                    : "cursor-grab border-transparent text-text-secondary hover:text-text-primary"
                  : activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-bg-tertiary"
              }`}
            >
              {unlocked && (
                <span className="mr-1.5 text-text-muted opacity-50 text-xs">⠿</span>
              )}
              {tab.label}
            </button>
          );
        })}

        <div className="flex-1" />

        <div className="flex items-center gap-2 pr-2">
          <ActionBar />
        </div>

        <div className="flex items-center gap-2 pr-3">
          {unlocked && (
            <button
              onClick={resetOrder}
              className="text-xs text-text-muted hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-bg-primary"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => setUnlocked((v) => !v)}
            title={unlocked ? "Lock tab order" : "Unlock to reorder tabs"}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              unlocked
                ? "bg-accent/20 text-accent hover:bg-accent/30"
                : "text-text-muted hover:text-text-primary hover:bg-bg-primary"
            }`}
          >
            {unlocked ? "🔓 Lock" : "🔒"}
          </button>
        </div>
      </div>

      {/* Floating ghost tab while dragging */}
      {ghostTab && (
        <div
          className="fixed pointer-events-none z-50 bg-accent/25 border border-accent/60 rounded px-3 py-1.5 text-sm font-medium text-accent shadow-lg"
          style={{
            left: ghostPos.x + 10,
            top: ghostPos.y - 16,
          }}
        >
          {ghostTab.label}
        </div>
      )}
    </nav>
  );
}
