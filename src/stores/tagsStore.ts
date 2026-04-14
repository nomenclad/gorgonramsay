/**
 * @module tagsStore
 *
 * User-defined custom tags that can be attached to ingredients (items) and
 * recipes. Tags are created once by name, then applied to any number of
 * ingredients or recipes for later filtering. All state here is user-authored
 * — no CDN data is involved.
 *
 * **Identifiers:**
 *  - Ingredients are keyed by their numeric `typeId` (item code).
 *  - Recipes are keyed by their string `id` (stable across CDN updates
 *    because recipe IDs come from the CDN's recipe keys, e.g. "recipe_4321").
 *  - Tag names are the primary identifier for tag definitions — names are
 *    case-preserving but compared case-insensitively to avoid accidental dupes.
 *
 * **Persistence:** A single JSON blob stored in IndexedDB under the
 * `userTags` table (see `lib/db.ts`). Writes are debounced so rapid edits
 * don't thrash IndexedDB. Since everything lives in the browser cache, the
 * Settings page exposes import/export buttons so users can back up and
 * restore tags if the cache is cleared.
 *
 * **Schema version:** `TagsExport.version` is bumped whenever the export
 * format changes. Importers accept older versions and migrate forward.
 */
import { create } from "zustand";
import { storeUserTags, getUserTags, clearUserTags } from "../lib/db";

/** Palette of accepted colors for tag chips. Keep in sync with TAG_COLORS below. */
export type TagColor =
  | "accent"
  | "gold"
  | "success"
  | "danger"
  | "blue"
  | "purple"
  | "pink"
  | "teal"
  | "gray";

export interface TagDefinition {
  /** Display name. Unique case-insensitively. */
  name: string;
  /** Color key used to render the tag chip. */
  color: TagColor;
  /** Epoch ms when the tag was created. */
  createdAt: number;
  /** Optional free-text description. */
  description?: string;
}

/** Stable ordered list of color options for the color picker. */
export const TAG_COLORS: { key: TagColor; label: string; classes: string }[] = [
  { key: "accent",  label: "Accent",  classes: "bg-accent/15 text-accent border-accent/40" },
  { key: "gold",    label: "Gold",    classes: "bg-gold/15 text-gold border-gold/40" },
  { key: "success", label: "Green",   classes: "bg-success/15 text-success border-success/40" },
  { key: "danger",  label: "Red",     classes: "bg-danger/15 text-danger border-danger/40" },
  { key: "blue",    label: "Blue",    classes: "bg-blue-400/15 text-blue-400 border-blue-400/40" },
  { key: "purple",  label: "Purple",  classes: "bg-purple-400/15 text-purple-400 border-purple-400/40" },
  { key: "pink",    label: "Pink",    classes: "bg-pink-400/15 text-pink-400 border-pink-400/40" },
  { key: "teal",    label: "Teal",    classes: "bg-teal-400/15 text-teal-400 border-teal-400/40" },
  { key: "gray",    label: "Gray",    classes: "bg-bg-primary text-text-secondary border-border" },
];

/** Resolve a TagColor to the Tailwind classes used for a chip. */
export function tagColorClasses(color: TagColor | undefined): string {
  return (TAG_COLORS.find((c) => c.key === color)?.classes) ?? TAG_COLORS[TAG_COLORS.length - 1].classes;
}

/**
 * Serialized export format. Only `tags`, `itemTags`, and `recipeTags` are
 * persisted — everything else (indexes, etc.) is derived at runtime.
 */
export interface TagsExport {
  version: 1;
  exportedAt: string;
  tags: TagDefinition[];
  /** Map from item typeId (as string key) to the tag names applied to it. */
  itemTags: Record<string, string[]>;
  /** Map from recipe id (string) to the tag names applied to it. */
  recipeTags: Record<string, string[]>;
}

interface TagsState {
  /** Ordered list of all user-defined tag definitions (by insertion order). */
  tags: TagDefinition[];
  /** typeId → tag names. Tag names here are always lower-cased for lookup. */
  itemTags: Map<number, string[]>;
  /** recipe id → tag names. */
  recipeTags: Map<string, string[]>;

  /** Has the initial hydrate from IndexedDB completed? */
  hydrated: boolean;

  // ——— Tag definition CRUD ———
  createTag: (name: string, color?: TagColor, description?: string) => boolean;
  renameTag: (oldName: string, newName: string) => boolean;
  updateTag: (name: string, patch: Partial<Pick<TagDefinition, "color" | "description">>) => void;
  deleteTag: (name: string) => void;

  // ——— Assignments ———
  toggleItemTag: (typeId: number, tagName: string) => void;
  setItemTags: (typeId: number, tagNames: string[]) => void;
  toggleRecipeTag: (recipeId: string, tagName: string) => void;
  setRecipeTags: (recipeId: string, tagNames: string[]) => void;

  // ——— Queries ———
  getItemTags: (typeId: number) => string[];
  getRecipeTags: (recipeId: string) => string[];
  getTagDefinition: (name: string) => TagDefinition | undefined;

  // ——— Bulk ———
  exportAll: () => TagsExport;
  importAll: (data: TagsExport, mode: "merge" | "replace") => { tagsAdded: number; itemAssignments: number; recipeAssignments: number };
  clearAll: () => void;

  /** Populate the store from the persisted blob. Called once at startup. */
  hydrate: () => Promise<void>;
}

/** Normalize a tag name for case-insensitive equality. */
function normTag(name: string): string {
  return name.trim().toLowerCase();
}

/** Build a map from normalized name → canonical (display) name. */
function nameMap(tags: TagDefinition[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of tags) m.set(normTag(t.name), t.name);
  return m;
}

/** Serialize a live state snapshot to the JSON export format. */
function snapshot(state: Pick<TagsState, "tags" | "itemTags" | "recipeTags">): TagsExport {
  const itemTags: Record<string, string[]> = {};
  for (const [typeId, names] of state.itemTags) {
    if (names.length > 0) itemTags[String(typeId)] = [...names];
  }
  const recipeTags: Record<string, string[]> = {};
  for (const [id, names] of state.recipeTags) {
    if (names.length > 0) recipeTags[id] = [...names];
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tags: state.tags.map((t) => ({ ...t })),
    itemTags,
    recipeTags,
  };
}

// Debounced save to IndexedDB so rapid edits batch into a single write.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(state: Pick<TagsState, "tags" | "itemTags" | "recipeTags">) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const blob = JSON.stringify(snapshot(state));
    storeUserTags(blob).catch((e) => console.warn("Failed to persist user tags:", e));
  }, 120);
}

export const useTagsStore = create<TagsState>((set, get) => ({
  tags: [],
  itemTags: new Map(),
  recipeTags: new Map(),
  hydrated: false,

  createTag: (name, color = "accent", description) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const key = normTag(trimmed);
    const existing = get().tags.find((t) => normTag(t.name) === key);
    if (existing) return false;
    const nextTag: TagDefinition = {
      name: trimmed,
      color,
      createdAt: Date.now(),
      description,
    };
    const next = { tags: [...get().tags, nextTag] };
    set(next);
    schedulePersist({ ...get(), ...next });
    return true;
  },

  renameTag: (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const oldKey = normTag(oldName);
    const newKey = normTag(trimmed);
    const tags = get().tags;
    const target = tags.find((t) => normTag(t.name) === oldKey);
    if (!target) return false;
    // If renaming to a name that already exists (other than self), bail.
    if (oldKey !== newKey && tags.some((t) => normTag(t.name) === newKey)) return false;

    const newTags = tags.map((t) => (normTag(t.name) === oldKey ? { ...t, name: trimmed } : t));
    const canonicalOld = target.name;
    const canonicalNew = trimmed;

    const itemTags = new Map<number, string[]>();
    for (const [id, names] of get().itemTags) {
      itemTags.set(id, names.map((n) => (n === canonicalOld ? canonicalNew : n)));
    }
    const recipeTags = new Map<string, string[]>();
    for (const [id, names] of get().recipeTags) {
      recipeTags.set(id, names.map((n) => (n === canonicalOld ? canonicalNew : n)));
    }
    const next = { tags: newTags, itemTags, recipeTags };
    set(next);
    schedulePersist({ ...get(), ...next });
    return true;
  },

  updateTag: (name, patch) => {
    const key = normTag(name);
    const newTags = get().tags.map((t) => (normTag(t.name) === key ? { ...t, ...patch } : t));
    set({ tags: newTags });
    schedulePersist({ ...get(), tags: newTags });
  },

  deleteTag: (name) => {
    const key = normTag(name);
    const target = get().tags.find((t) => normTag(t.name) === key);
    if (!target) return;
    const canonical = target.name;

    const newTags = get().tags.filter((t) => normTag(t.name) !== key);

    const itemTags = new Map<number, string[]>();
    for (const [id, names] of get().itemTags) {
      const filtered = names.filter((n) => n !== canonical);
      if (filtered.length > 0) itemTags.set(id, filtered);
    }
    const recipeTags = new Map<string, string[]>();
    for (const [id, names] of get().recipeTags) {
      const filtered = names.filter((n) => n !== canonical);
      if (filtered.length > 0) recipeTags.set(id, filtered);
    }

    const next = { tags: newTags, itemTags, recipeTags };
    set(next);
    schedulePersist({ ...get(), ...next });
  },

  toggleItemTag: (typeId, tagName) => {
    const names = get().getTagDefinition(tagName);
    if (!names) return;
    const canonical = names.name;
    const current = get().itemTags.get(typeId) ?? [];
    const hasIt = current.includes(canonical);
    const nextNames = hasIt ? current.filter((n) => n !== canonical) : [...current, canonical];
    const itemTags = new Map(get().itemTags);
    if (nextNames.length === 0) itemTags.delete(typeId);
    else itemTags.set(typeId, nextNames);
    set({ itemTags });
    schedulePersist({ ...get(), itemTags });
  },

  setItemTags: (typeId, tagNames) => {
    const itemTags = new Map(get().itemTags);
    const canonicalByKey = nameMap(get().tags);
    // Resolve each provided name to its canonical form; drop unknowns.
    const resolved: string[] = [];
    for (const n of tagNames) {
      const canonical = canonicalByKey.get(normTag(n));
      if (canonical && !resolved.includes(canonical)) resolved.push(canonical);
    }
    if (resolved.length === 0) itemTags.delete(typeId);
    else itemTags.set(typeId, resolved);
    set({ itemTags });
    schedulePersist({ ...get(), itemTags });
  },

  toggleRecipeTag: (recipeId, tagName) => {
    const def = get().getTagDefinition(tagName);
    if (!def) return;
    const canonical = def.name;
    const current = get().recipeTags.get(recipeId) ?? [];
    const hasIt = current.includes(canonical);
    const nextNames = hasIt ? current.filter((n) => n !== canonical) : [...current, canonical];
    const recipeTags = new Map(get().recipeTags);
    if (nextNames.length === 0) recipeTags.delete(recipeId);
    else recipeTags.set(recipeId, nextNames);
    set({ recipeTags });
    schedulePersist({ ...get(), recipeTags });
  },

  setRecipeTags: (recipeId, tagNames) => {
    const recipeTags = new Map(get().recipeTags);
    const canonicalByKey = nameMap(get().tags);
    const resolved: string[] = [];
    for (const n of tagNames) {
      const canonical = canonicalByKey.get(normTag(n));
      if (canonical && !resolved.includes(canonical)) resolved.push(canonical);
    }
    if (resolved.length === 0) recipeTags.delete(recipeId);
    else recipeTags.set(recipeId, resolved);
    set({ recipeTags });
    schedulePersist({ ...get(), recipeTags });
  },

  getItemTags: (typeId) => get().itemTags.get(typeId) ?? [],
  getRecipeTags: (recipeId) => get().recipeTags.get(recipeId) ?? [],
  getTagDefinition: (name) => {
    const key = normTag(name);
    return get().tags.find((t) => normTag(t.name) === key);
  },

  exportAll: () => snapshot(get()),

  importAll: (data, mode) => {
    // Defensive parse — fall back to empty structures if fields are missing.
    const incomingTags: TagDefinition[] = Array.isArray(data.tags) ? data.tags : [];
    const incomingItemTags = data.itemTags ?? {};
    const incomingRecipeTags = data.recipeTags ?? {};

    let tags: TagDefinition[];
    let itemTags: Map<number, string[]>;
    let recipeTags: Map<string, string[]>;

    if (mode === "replace") {
      tags = incomingTags.map((t) => ({
        name: String(t.name ?? "").trim() || "Untitled",
        color: (t.color ?? "accent") as TagColor,
        createdAt: Number(t.createdAt) || Date.now(),
        description: t.description,
      }));
      itemTags = new Map();
      recipeTags = new Map();
    } else {
      tags = [...get().tags];
      itemTags = new Map(get().itemTags);
      recipeTags = new Map(get().recipeTags);
      const existingKeys = new Set(tags.map((t) => normTag(t.name)));
      for (const t of incomingTags) {
        const name = String(t.name ?? "").trim();
        if (!name) continue;
        if (existingKeys.has(normTag(name))) continue;
        tags.push({
          name,
          color: (t.color ?? "accent") as TagColor,
          createdAt: Number(t.createdAt) || Date.now(),
          description: t.description,
        });
        existingKeys.add(normTag(name));
      }
    }

    const canonicalByKey = nameMap(tags);
    let itemAssignments = 0;
    for (const [idStr, names] of Object.entries(incomingItemTags)) {
      const typeId = Number(idStr);
      if (!Number.isFinite(typeId)) continue;
      if (!Array.isArray(names)) continue;
      const existing = mode === "replace" ? [] : (itemTags.get(typeId) ?? []);
      const combined = [...existing];
      for (const rawName of names) {
        const canonical = canonicalByKey.get(normTag(String(rawName)));
        if (canonical && !combined.includes(canonical)) {
          combined.push(canonical);
          itemAssignments++;
        }
      }
      if (combined.length > 0) itemTags.set(typeId, combined);
    }

    let recipeAssignments = 0;
    for (const [id, names] of Object.entries(incomingRecipeTags)) {
      if (!Array.isArray(names)) continue;
      const existing = mode === "replace" ? [] : (recipeTags.get(id) ?? []);
      const combined = [...existing];
      for (const rawName of names) {
        const canonical = canonicalByKey.get(normTag(String(rawName)));
        if (canonical && !combined.includes(canonical)) {
          combined.push(canonical);
          recipeAssignments++;
        }
      }
      if (combined.length > 0) recipeTags.set(id, combined);
    }

    const next = { tags, itemTags, recipeTags };
    set(next);
    schedulePersist({ ...get(), ...next });

    return {
      tagsAdded: tags.length - (mode === "replace" ? 0 : get().tags.length),
      itemAssignments,
      recipeAssignments,
    };
  },

  clearAll: () => {
    const next = { tags: [] as TagDefinition[], itemTags: new Map(), recipeTags: new Map() };
    set(next);
    clearUserTags().catch((e) => console.warn("Failed to clear user tags:", e));
  },

  hydrate: async () => {
    try {
      const blob = await getUserTags();
      if (!blob) {
        set({ hydrated: true });
        return;
      }
      const data: TagsExport = JSON.parse(blob);
      const tags: TagDefinition[] = Array.isArray(data.tags)
        ? data.tags.map((t) => ({
            name: String(t.name ?? "").trim() || "Untitled",
            color: (t.color ?? "accent") as TagColor,
            createdAt: Number(t.createdAt) || Date.now(),
            description: t.description,
          }))
        : [];
      const itemTags = new Map<number, string[]>();
      for (const [idStr, names] of Object.entries(data.itemTags ?? {})) {
        const typeId = Number(idStr);
        if (Number.isFinite(typeId) && Array.isArray(names)) {
          itemTags.set(typeId, names.map(String));
        }
      }
      const recipeTags = new Map<string, string[]>();
      for (const [id, names] of Object.entries(data.recipeTags ?? {})) {
        if (Array.isArray(names)) recipeTags.set(id, names.map(String));
      }
      set({ tags, itemTags, recipeTags, hydrated: true });
    } catch (e) {
      console.warn("Failed to hydrate user tags — starting empty:", e);
      set({ hydrated: true });
    }
  },
}));
