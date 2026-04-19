/**
 * Historical update log — rendered as a portal modal invoked from the
 * header's "Changelog" button (next to Help). A curated, human-authored
 * summary of the app's feature evolution derived from the git history
 * but grouped into user-facing release notes rather than raw commits.
 *
 * How to add new entries:
 *   Append to `CHANGELOG` below in reverse-chronological order (newest
 *   first). Each entry gets a date, optional version tag, a headline,
 *   and a list of bullet items grouped by type ("added" / "changed" /
 *   "fixed").
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";

type EntryKind = "added" | "changed" | "fixed";

interface ChangelogItem {
  kind: EntryKind;
  text: string;
}

interface ChangelogEntry {
  date: string;      // ISO date (YYYY-MM-DD)
  version?: string;  // optional version tag, e.g. "v0.6"
  title: string;
  items: ChangelogItem[];
}

/**
 * Curated release notes. Keep entries user-focused: what changed from the
 * player's perspective rather than internal refactors or CI fixes.
 */
const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-04-15",
    title: "Milling skill, and tag popover polish",
    items: [
      { kind: "added", text: "Milling skill is now supported — the 7 wiki-sourced milling recipes (Barley, Flower Seeds, Tundra Rye, Almonds, Oat Groats, Corn, Orcish Wheat) are side-loaded into the game data so their ingredients and flour outputs show on the Ingredients and Recipes tabs. 'Milling' appears as a filterable skill in the sidebar." },
      { kind: "added", text: "The planner auto-resolves Milling as an intermediate crafting step, so queuing a recipe that needs flour can now pull in the milling operation." },
      { kind: "fixed", text: "Tag popover (the '+ Tag' button on Ingredients and Recipes rows) no longer gets clipped by the table or scroll container — it's portaled to the page, flips above the button when space below is tight, and stays fully within the viewport without scrolling." },
    ],
  },
  {
    date: "2026-04-14",
    title: "Custom tags, tag import/export, and this changelog",
    items: [
      { kind: "added", text: "Create your own custom tags and apply them to any ingredient or recipe from the new Tags column or detail modal." },
      { kind: "added", text: "Filter the Ingredients and Recipes tabs by tag using the new tag-chip toolbar." },
      { kind: "added", text: "Export and import tag definitions + assignments as JSON from Settings, so your tags can be restored after a browser cache wipe." },
      { kind: "added", text: "Added this Changelog button (top-right, beside Help) so new features are easy to discover." },
      { kind: "added", text: "Alt Qty column on the Ingredients tab — shows totals held by inactive alts with a per-character tooltip." },
    ],
  },
  {
    date: "2026-04-02",
    title: "Alt-aware Gourmand filter",
    items: [
      { kind: "added", text: "'Alt Craftable' filter in the Gourmand tracker surfaces foods that one of your other characters can make." },
    ],
  },
  {
    date: "2026-03-29",
    title: "Gourmand and inventory bug-fixes",
    items: [
      { kind: "fixed", text: "'On Hand' filter now checks whether the food item itself is in your inventory, not just its ingredients." },
      { kind: "changed", text: "Gourmand rows show the required eating level (from SkillReqs) instead of the food's tier, and drop the XP-value column." },
    ],
  },
  {
    date: "2026-03-28",
    title: "Quick Cook auto-planner and First Craft toggle",
    items: [
      { kind: "added", text: "Quick Cook automatically queues recipes to hit your 'Max Lvl Cook' target using what you already have." },
      { kind: "added", text: "First Craft toggle on the Recipes tab highlights recipes that still earn the one-time first-craft XP bonus." },
      { kind: "added", text: "Delete imported character / inventory / eaten-foods files directly from Settings." },
      { kind: "changed", text: "Quick Cook now ignores Gardening and Cheesemaking ingredients since those recipes aren't cooked at a stove." },
    ],
  },
  {
    date: "2026-03-26",
    title: "Multi-character (alt) support",
    items: [
      { kind: "added", text: "Import multiple characters on the same server; switch between alts from the header dropdown." },
      { kind: "added", text: "Transfer Chest routing: the planner automatically sees inventory across alts where a shared storage vault is set up." },
      { kind: "fixed", text: "Switching characters now cleanly clears the previous character's data so nothing bleeds between alts." },
    ],
  },
  {
    date: "2026-03-25",
    title: "Persistence, Gourmand eaten tracking, and UX polish",
    items: [
      { kind: "added", text: "App state now persists across page refreshes via IndexedDB — no need to re-import on every reload." },
      { kind: "added", text: "Gourmand eaten-foods tracking imports your local PG Books file and annotates each food with 'Eaten' status." },
      { kind: "added", text: "Help modal with import instructions and file-location hints for new users." },
      { kind: "changed", text: "Replaced the Learnable/Known toggle chips with a cleaner mutually-exclusive button group on the Recipes tab." },
      { kind: "fixed", text: "Gourmand status filter and eaten-column key lookup now use the correct recipe identifiers." },
    ],
  },
  {
    date: "2026-03-24",
    title: "Major UI overhaul and web deployment",
    items: [
      { kind: "added", text: "Deployed the app to GitHub Pages; web version supports folder watching via the File System Access API (Chrome/Edge)." },
      { kind: "added", text: "New Purchasing tab in the Planner between Foraging and Cooking — one vendor per item, preferring the cooking zone." },
      { kind: "added", text: "Gardening tab split out from Foraging using a wiki-sourced crop list." },
      { kind: "added", text: "Meal / Snack type column on the Recipe browser." },
      { kind: "added", text: "Card / list view toggle for planner tabs." },
      { kind: "added", text: "Action bar and column-level filters across every data table." },
      { kind: "fixed", text: "Blank zone dropdowns in the cooking planner." },
      { kind: "fixed", text: "Planner memos now react to inventory changes so it no longer shows stale requirements." },
    ],
  },
  {
    date: "2026-03-21",
    version: "v0.1",
    title: "Initial release",
    items: [
      { kind: "added", text: "Tauri + React desktop shell with a tab-based UI: Ingredients, Recipes, Gourmand, Planner, Crafting, Settings." },
      { kind: "added", text: "Recipe browser with skill / knowledge filters and XP drop-off calculations." },
      { kind: "added", text: "Ingredient browser merging game data with your inventory to show owned vs. missing items." },
      { kind: "added", text: "Gourmand tracker and gold-efficiency optimizer for cooking XP planning." },
      { kind: "added", text: "Automatic CDN game-data fetching with version-aware caching." },
    ],
  },
];

const KIND_STYLE: Record<EntryKind, { label: string; classes: string }> = {
  added:   { label: "Added",   classes: "bg-success/10 text-success border-success/30" },
  changed: { label: "Changed", classes: "bg-accent/10 text-accent border-accent/30" },
  fixed:   { label: "Fixed",   classes: "bg-gold/10 text-gold border-gold/30" },
};

function formatDate(iso: string): string {
  // Parse as UTC to avoid TZ drift for dates-only values.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

interface Props {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Update Log</h2>
            <p className="text-xs text-text-muted mt-0.5">
              A running history of new features, improvements, and fixes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none px-1"
            aria-label="Close changelog"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4">
          <ol className="relative border-l border-border/60 ml-3 space-y-6">
            {CHANGELOG.map((entry) => (
              <li key={entry.date + entry.title} className="ml-5">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-accent border-2 border-bg-primary" />
                <div className="flex flex-wrap items-baseline gap-2">
                  <time className="text-xs text-text-muted font-mono">{formatDate(entry.date)}</time>
                  {entry.version && (
                    <span className="text-xs bg-accent/10 text-accent border border-accent/30 rounded px-1.5 py-0.5 font-medium">
                      {entry.version}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold mt-0.5 text-text-primary">{entry.title}</h3>
                <ul className="mt-2 space-y-1.5">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 mt-0.5 ${KIND_STYLE[item.kind].classes}`}>
                        {KIND_STYLE[item.kind].label}
                      </span>
                      <span className="text-text-secondary">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <p className="text-xs text-text-muted pt-4 mt-4 border-t border-border/40">
            Want the full commit-level history? See the
            {" "}
            <a
              href="https://github.com/nomenclad/gorgonramsay/commits"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              repository on GitHub
            </a>.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
