/**
 * Reusable compact tag editor. Shows currently-applied tags and a
 * "+ Add" trigger that expands to a small popover letting the user:
 *   - toggle any existing tag on/off for this resource
 *   - create a new tag on the fly
 *
 * Works for both ingredient (item) and recipe assignments via the
 * `resource` prop. The parent never needs to touch the tags store.
 *
 * Popover positioning:
 *   The popover is rendered through a portal on `document.body` and
 *   positioned with `position: fixed` using the trigger button's
 *   bounding rect. This avoids clipping by table cells, overflow
 *   containers, and scrollable tab panes, so clicking "+ Tag" on
 *   the last row of a long table no longer requires scrolling.
 *   The popover flips above the button when there isn't enough room
 *   below the viewport, and its left edge is clamped to the right
 *   edge of the viewport.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTagsStore, TAG_COLORS, type TagColor } from "../../stores/tagsStore";
import { TagChip } from "./TagChip";

type Resource =
  | { kind: "item"; typeId: number }
  | { kind: "recipe"; recipeId: string };

interface Props {
  resource: Resource;
  /** Allow creating brand-new tag definitions from this editor. */
  canCreate?: boolean;
  /** Size of the rendered chips. */
  size?: "xs" | "sm";
  /** Compact placeholder to render when no tags are set. */
  emptyLabel?: string;
  /** Additional classes for the outer container. */
  className?: string;
}

/** Popover width in pixels — used for right-edge viewport clamping. */
const POPOVER_WIDTH = 256;

/** Rough height estimate used to decide whether to flip above the trigger. */
const POPOVER_MAX_HEIGHT = 320;

interface PopoverPos {
  top: number;
  left: number;
  /** Max height we give the popover body so it always fits the viewport. */
  maxHeight: number;
}

export function TagEditor({ resource, canCreate = true, size = "xs", emptyLabel = "No tags", className }: Props) {
  const allTags = useTagsStore((s) => s.tags);
  const itemTags = useTagsStore((s) => s.itemTags);
  const recipeTags = useTagsStore((s) => s.recipeTags);
  const toggleItemTag = useTagsStore((s) => s.toggleItemTag);
  const toggleRecipeTag = useTagsStore((s) => s.toggleRecipeTag);
  const createTag = useTagsStore((s) => s.createTag);

  const applied = useMemo(() => {
    if (resource.kind === "item") return itemTags.get(resource.typeId) ?? [];
    return recipeTags.get(resource.recipeId) ?? [];
  }, [resource, itemTags, recipeTags]);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("accent");
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  /**
   * Recompute the popover's fixed position relative to the trigger button.
   * Called whenever the popover opens and on scroll / resize while open so
   * it stays anchored if the user scrolls the page behind it.
   */
  function computePos() {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < POPOVER_MAX_HEIGHT && spaceAbove > spaceBelow;

    // Align the popover's left edge with the trigger, but clamp so it never
    // runs past the right edge of the viewport (leave an 8px gutter).
    const left = Math.max(8, Math.min(vw - POPOVER_WIDTH - 8, rect.left));
    const top = openUpward
      ? Math.max(8, rect.top - 4) // anchor bottom of popover to top of button
      : rect.bottom + 4;

    const maxHeight = openUpward
      ? Math.max(160, rect.top - 16)
      : Math.max(160, vh - rect.bottom - 16);

    setPos({ top: openUpward ? top - Math.min(maxHeight, POPOVER_MAX_HEIGHT) : top, left, maxHeight });
  }

  // Recompute on open; bail out on close.
  useLayoutEffect(() => {
    if (!open) return;
    computePos();
  }, [open]);

  // Keep the popover anchored when the page behind it scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const onReflow = () => computePos();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  // Close when clicking outside the popover + trigger, or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
      setCreating(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleToggle(tagName: string) {
    if (resource.kind === "item") toggleItemTag(resource.typeId, tagName);
    else toggleRecipeTag(resource.recipeId, tagName);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const ok = createTag(name, newColor);
    if (ok) {
      // Auto-apply the freshly-created tag to this resource for convenience.
      if (resource.kind === "item") toggleItemTag(resource.typeId, name);
      else toggleRecipeTag(resource.recipeId, name);
    }
    setNewName("");
    setCreating(false);
  }

  const popover = open && pos ? (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-bg-primary border border-border rounded-lg shadow-xl p-2 space-y-2"
      style={{
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs text-text-muted px-1">Click to apply / remove</div>
      <div className="flex flex-wrap gap-1 px-1">
        {allTags.length === 0 && (
          <span className="text-xs text-text-muted italic">No tags yet — create one below.</span>
        )}
        {allTags.map((t) => {
          const active = applied.includes(t.name);
          return (
            <TagChip
              key={t.name}
              name={t.name}
              active={active}
              onClick={() => handleToggle(t.name)}
            />
          );
        })}
      </div>

      {canCreate && (
        <div className="pt-1 border-t border-border/40">
          {creating ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                autoFocus
                placeholder="New tag name"
                className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs text-text-primary"
              />
              <div className="flex flex-wrap gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setNewColor(c.key)}
                    title={c.label}
                    className={`w-5 h-5 rounded-full border ${c.classes} ${newColor === c.key ? "ring-2 ring-text-primary/60" : ""}`}
                  />
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="text-xs bg-accent hover:bg-accent-hover text-white px-2 py-1 rounded"
                >
                  Create & Apply
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="text-xs text-accent hover:underline"
            >
              + Create new tag…
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {applied.length === 0 ? (
        <span className="text-xs text-text-muted italic">{emptyLabel}</span>
      ) : (
        applied.map((name) => (
          <TagChip
            key={name}
            name={name}
            size={size}
            onRemove={() => handleToggle(name)}
          />
        ))
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-xs text-text-muted hover:text-text-primary border border-border rounded px-1.5 py-0.5 transition-colors"
        title="Add or remove tags"
      >
        {open ? "Close" : "+ Tag"}
      </button>

      {popover && createPortal(popover, document.body)}
    </div>
  );
}
