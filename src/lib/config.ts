/**
 * Centralized application configuration.
 *
 * All external service URLs, shared constants, and URL builders live here
 * so they can be updated in one place when upstream services change.
 *
 * To change a URL or constant:
 *   1. Update the value here.
 *   2. If the change affects the build script (scripts/fetch-cdn-data.mjs),
 *      update it there too — the script runs outside the Vite/TS pipeline
 *      and cannot import this module directly.
 *   3. If the change affects the Vite dev proxy (vite.config.ts), update
 *      the proxy target there as well.
 */

// ---------------------------------------------------------------------------
// External service URLs
// ---------------------------------------------------------------------------

/** Base URL for Project Gorgon's CDN (game data JSON and item icons). */
export const CDN_BASE = "https://cdn.projectgorgon.com";

/**
 * HTTP endpoint that returns the current CDN data version number.
 * Note: this is HTTP (not HTTPS), which causes CORS/mixed-content issues
 * in the browser. The Vite dev proxy and Tauri Rust backend handle this.
 */
export const VERSION_URL = "http://client.projectgorgon.com/fileversion.txt";

/** Base URL for the Project Gorgon community wiki. */
export const WIKI_BASE = "https://wiki.projectgorgon.com/wiki";

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the CDN URL for an item icon.
 *
 * @param cdnVersion - The CDN data version number (e.g. 449).
 * @param iconId     - The item's IconId from items.json.
 * @returns Full URL like "https://cdn.projectgorgon.com/v449/icons/icon_5123.png"
 */
export function iconUrl(cdnVersion: number, iconId: number): string {
  return `${CDN_BASE}/v${cdnVersion}/icons/icon_${iconId}.png`;
}

/**
 * Build a wiki URL for a given item or page name.
 *
 * @param name - Display name (spaces are converted to underscores).
 * @returns Full URL like "https://wiki.projectgorgon.com/wiki/Goblin_Bread"
 */
export function wikiUrl(name: string): string {
  const slug = name.replace(/ /g, "_");
  return `${WIKI_BASE}/${encodeURIComponent(slug)}`;
}

// ---------------------------------------------------------------------------
// UI defaults
// ---------------------------------------------------------------------------

/**
 * Default number of rows per page in data tables (Recipes, Gourmand, Inventory).
 * To change the page size for all tables, update this value.
 */
export const DEFAULT_PAGE_SIZE = 100;

/**
 * Zones that have Transfer Chests (account-shared storage).
 * Alts can deposit items into any Transfer Chest; the main character
 * picks them up from whichever zone is most convenient on their route.
 * To add new Transfer Chest locations, append the zone name here.
 */
export const TRANSFER_CHEST_ZONES = ["Serbule", "Serbule Hills", "Kur Mountains", "Rahu"];
