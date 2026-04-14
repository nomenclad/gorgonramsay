/**
 * Settings section for managing user-defined custom tags.
 *
 * Responsibilities:
 *  - List every defined tag with counts, rename / recolor / delete controls.
 *  - Create new tag definitions from the settings page.
 *  - Export the full tag database (definitions + ingredient/recipe assignments)
 *    to a JSON file so users can back up before the browser cache is wiped.
 *  - Import an exported JSON blob, either merging with the current tags or
 *    replacing them entirely.
 */
import { useMemo, useRef, useState } from "react";
import { useTagsStore, TAG_COLORS, type TagColor, type TagsExport } from "../../stores/tagsStore";
import { TagChip } from "../common/TagChip";

export function TagsSettingsSection() {
  const tags = useTagsStore((s) => s.tags);
  const itemTags = useTagsStore((s) => s.itemTags);
  const recipeTags = useTagsStore((s) => s.recipeTags);
  const createTag = useTagsStore((s) => s.createTag);
  const renameTag = useTagsStore((s) => s.renameTag);
  const updateTag = useTagsStore((s) => s.updateTag);
  const deleteTag = useTagsStore((s) => s.deleteTag);
  const exportAll = useTagsStore((s) => s.exportAll);
  const importAll = useTagsStore((s) => s.importAll);
  const clearAll = useTagsStore((s) => s.clearAll);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("accent");
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-compute counts so each row can show how many ingredients / recipes carry it.
  const counts = useMemo(() => {
    const map = new Map<string, { items: number; recipes: number }>();
    for (const t of tags) map.set(t.name, { items: 0, recipes: 0 });
    for (const names of itemTags.values()) {
      for (const n of names) {
        const c = map.get(n);
        if (c) c.items++;
      }
    }
    for (const names of recipeTags.values()) {
      for (const n of names) {
        const c = map.get(n);
        if (c) c.recipes++;
      }
    }
    return map;
  }, [tags, itemTags, recipeTags]);

  const totalAssignments = useMemo(() => {
    let n = 0;
    for (const names of itemTags.values()) n += names.length;
    for (const names of recipeTags.values()) n += names.length;
    return n;
  }, [itemTags, recipeTags]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const ok = createTag(name, newColor);
    if (ok) {
      setStatus(`✓ Created tag "${name}"`);
      setNewName("");
    } else {
      setStatus(`✗ A tag named "${name}" already exists`);
    }
  }

  function handleExport() {
    const data = exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    a.href = url;
    a.download = `gorgonramsay-tags-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`✓ Exported ${data.tags.length} tag${data.tags.length === 1 ? "" : "s"} and ${
      Object.keys(data.itemTags).length + Object.keys(data.recipeTags).length
    } assigned resources`);
  }

  async function handleImportFile(file: File, mode: "merge" | "replace") {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as TagsExport;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tags)) {
        throw new Error("File does not look like a tags export");
      }
      const report = importAll(parsed, mode);
      setStatus(
        `✓ Imported ${parsed.tags.length} tag${parsed.tags.length === 1 ? "" : "s"} ` +
        `(${mode}) — ${report.itemAssignments} ingredient / ${report.recipeAssignments} recipe assignments added`,
      );
    } catch (e) {
      setStatus(`✗ Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleRenameCommit(oldName: string) {
    const next = editBuffer.trim();
    if (next && next !== oldName) {
      const ok = renameTag(oldName, next);
      if (!ok) setStatus(`✗ Could not rename — a tag named "${next}" already exists`);
      else setStatus(`✓ Renamed "${oldName}" → "${next}"`);
    }
    setEditing(null);
    setEditBuffer("");
  }

  return (
    <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-sm">Custom Tags</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Create your own labels and apply them to ingredients and recipes for custom filtering.
            Tags are stored in your browser — export a backup here in case your cache is cleared.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleExport}
            disabled={tags.length === 0 && totalAssignments === 0}
            className="border border-border hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed text-text-secondary hover:text-text-primary px-3 py-1.5 rounded text-xs transition-colors"
          >
            ⬇ Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-border hover:border-accent text-text-secondary hover:text-text-primary px-3 py-1.5 rounded text-xs transition-colors"
          >
            ⬆ Import JSON…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const replace = window.confirm(
                `Import tags from "${file.name}"?\n\n` +
                `OK = Replace all existing tags with the imported ones.\n` +
                `Cancel = Merge (keep existing, add new).`,
              );
              await handleImportFile(file, replace ? "replace" : "merge");
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Create new tag */}
      <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/40">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-text-muted">New tag name</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. Favorite, Mastery Path, Hoarded"
            className="bg-bg-primary border border-border rounded px-2.5 py-1.5 text-sm text-text-primary w-56"
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-text-muted">Color</span>
          <div className="flex flex-wrap gap-1">
            {TAG_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setNewColor(c.key)}
                title={c.label}
                className={`w-6 h-6 rounded-full border ${c.classes} ${newColor === c.key ? "ring-2 ring-text-primary/60" : ""}`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm transition-colors"
        >
          + Create Tag
        </button>
      </div>

      {/* List existing tags */}
      {tags.length === 0 ? (
        <div className="text-xs text-text-muted italic pt-1">
          No custom tags yet. Create one above or from the "+ Tag" button on any ingredient or recipe row.
        </div>
      ) : (
        <div className="space-y-1 pt-1 border-t border-border/40">
          {tags.map((t) => {
            const c = counts.get(t.name) ?? { items: 0, recipes: 0 };
            const isEditing = editing === t.name;
            return (
              <div
                key={t.name}
                className="flex flex-wrap items-center gap-2 py-1.5 px-2 bg-bg-primary rounded border border-border/40"
              >
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    onBlur={() => handleRenameCommit(t.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameCommit(t.name);
                      if (e.key === "Escape") { setEditing(null); setEditBuffer(""); }
                    }}
                    className="bg-bg-secondary border border-accent/60 rounded px-2 py-0.5 text-sm text-text-primary w-56"
                  />
                ) : (
                  <TagChip
                    name={t.name}
                    size="sm"
                    title={t.description ?? t.name}
                  />
                )}

                <div className="flex items-center gap-1">
                  {TAG_COLORS.map((c2) => (
                    <button
                      key={c2.key}
                      type="button"
                      onClick={() => updateTag(t.name, { color: c2.key })}
                      title={c2.label}
                      className={`w-4 h-4 rounded-full border ${c2.classes} ${t.color === c2.key ? "ring-2 ring-text-primary/60" : ""}`}
                    />
                  ))}
                </div>

                <span className="text-xs text-text-muted ml-2">
                  {c.items} ingredient{c.items === 1 ? "" : "s"} · {c.recipes} recipe{c.recipes === 1 ? "" : "s"}
                </span>

                <div className="ml-auto flex items-center gap-2">
                  {!isEditing && (
                    <button
                      onClick={() => { setEditing(t.name); setEditBuffer(t.name); }}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      Rename
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (c.items + c.recipes > 0) {
                        if (!window.confirm(`Delete tag "${t.name}"? This will remove it from ${c.items} ingredients and ${c.recipes} recipes.`)) return;
                      }
                      deleteTag(t.name);
                      setStatus(`✓ Deleted tag "${t.name}"`);
                    }}
                    className="text-xs text-danger hover:text-danger/80"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {tags.length > 0 && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  if (!window.confirm("Delete ALL custom tags and their assignments? This cannot be undone.")) return;
                  clearAll();
                  setStatus("✓ All custom tags cleared");
                }}
                className="text-xs text-danger hover:underline"
              >
                Clear all tags
              </button>
            </div>
          )}
        </div>
      )}

      {status && (
        <div
          className={`text-xs ${
            status.startsWith("✓") ? "text-success" : "text-danger"
          }`}
        >
          {status}
        </div>
      )}
    </section>
  );
}
