/**
 * Reusable compact tag editor. Shows currently-applied tags and a
 * "+ Add" trigger that expands to a small popover letting the user:
 *   - toggle any existing tag on/off for this resource
 *   - create a new tag on the fly
 *
 * Works for both ingredient (item) and recipe assignments via the
 * `resource` prop. The parent never needs to touch the tags store.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
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

  return (
    <div ref={rootRef} className={`relative inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}>
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
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="text-xs text-text-muted hover:text-text-primary border border-border rounded px-1.5 py-0.5 transition-colors"
        title="Add or remove tags"
      >
        {open ? "Close" : "+ Tag"}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-40 w-64 bg-bg-primary border border-border rounded-lg shadow-xl p-2 space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-text-muted px-1">Click to apply / remove</div>
          <div className="max-h-44 overflow-y-auto flex flex-wrap gap-1 px-1">
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
      )}
    </div>
  );
}
