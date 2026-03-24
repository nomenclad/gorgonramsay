/**
 * Resolves raw StorageVault keys from the inventory export to human-readable
 * display names using storagevaults.json and areas.json from the CDN.
 *
 * Key format examples: "*AccountStorage_Serbule", "DalvosChest", "NPC_Ashk"
 * Display format:      "Serbule Transfer Chest (Serbule)"
 */

interface RawVaultEntry {
  NpcFriendlyName?: string;
  Area?: string;
  ID?: number;
}

// Module-level maps populated by loadVaultData / loadAreaData
let vaultMap: Map<string, RawVaultEntry> = new Map();
let areaDisplayNames: Map<string, string> = new Map();

export function loadVaultData(json: string): void {
  const raw: Record<string, RawVaultEntry> = JSON.parse(json);
  vaultMap = new Map(Object.entries(raw));
}

export function loadAreaData(json: string): void {
  const raw: Record<string, { FriendlyName?: string; ShortFriendlyName?: string }> = JSON.parse(json);
  areaDisplayNames = new Map(
    Object.entries(raw).map(([k, v]) => [k, v.ShortFriendlyName ?? v.FriendlyName ?? k])
  );
}

/**
 * Returns the display name of the zone a vault is in, or null if unknown.
 */
export function getVaultZone(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key === "__on_person__") return null; // treated as already on hand, not a vault stop
  const entry = vaultMap.get(key);
  if (!entry?.Area || entry.Area === "*") return null;
  return areaDisplayNames.get(entry.Area) ?? entry.Area.replace(/^Area/, "");
}

/**
 * Returns a sorted list of all unique zone display names from loaded vault data.
 */
export function getAllZones(): string[] {
  const zones = new Set<string>();
  for (const entry of vaultMap.values()) {
    if (entry.Area && entry.Area !== "*") {
      const zone = areaDisplayNames.get(entry.Area) ?? entry.Area.replace(/^Area/, "");
      zones.add(zone);
    }
  }
  return Array.from(zones).sort();
}

/**
 * Returns a sorted list of ALL zone display names from loaded area data.
 * This includes all game zones, not just those with storage vaults.
 */
export function getAllAreaZones(): string[] {
  if (areaDisplayNames.size === 0) return getAllZones(); // fallback to vault zones if area data not loaded
  return Array.from(new Set(areaDisplayNames.values())).sort();
}

/**
 * Returns a human-readable label for a vault key.
 * Falls back gracefully when data isn't loaded or the key is null/undefined.
 */
export function formatVaultName(key: string | null | undefined): string {
  if (!key) return "Unknown";
  if (key === "__on_person__") return "Saddlebag";

  const entry = vaultMap.get(key);
  if (!entry) {
    // No vault data loaded yet — format the raw key readably
    return key
      .replace(/^\*/, "")
      .replace(/^AccountStorage_/, "")
      .replace(/^NPC_/, "")
      .replace(/([A-Z])/g, " $1")
      .trim() || key;
  }

  const name = entry.NpcFriendlyName ?? key;
  const areaCode = entry.Area;

  if (!areaCode || areaCode === "*") return name;

  const zone = areaDisplayNames.get(areaCode) ?? areaCode.replace(/^Area/, "");
  return `${name} (${zone})`;
}
