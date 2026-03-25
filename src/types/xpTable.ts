/**
 * Types for XP tables from the CDN's xptables.json.
 *
 * Each XP table maps skill levels to XP amounts. Different skills
 * reference different tables (e.g. Gourmand uses the "Gourmand" table).
 */
export interface XpTable {
  /** CDN key, e.g. "Table_12". */
  id: string;
  /** Human-readable skill name, e.g. "Gourmand", "Cooking". Used to look up the correct table. */
  InternalName: string;
  /** XP amounts indexed by level — XpAmounts[N] is the XP value for level N. */
  XpAmounts: number[];
}
