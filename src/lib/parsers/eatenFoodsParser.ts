/**
 * Parse the Gourmand "Foods Consumed" report from the game's local Books directory.
 *
 * The game writes a text file listing every food the player has eaten for
 * Gourmand XP. This is the ONLY reliable source of eaten-food data — the
 * /exportcharacter JSON does not include it.
 *
 * File location (varies by OS):
 *   macOS:  ~/Library/Application Support/unity.Elder Game.Project Gorgon/Books/
 *   Windows: %APPDATA%/../LocalLow/Elder Game/Project Gorgon/Books/
 *   Linux:  ~/.config/unity3d/Elder Game/Project Gorgon/Books/
 *
 * Format: plain text with a "Foods Consumed:" header, followed by lines like:
 *   "  Large Strawberry: 16"
 *   "  Bacon (HAS MEAT): 21"
 *
 * The tags (HAS MEAT, HAS DAIRY, HAS EGGS) are stripped during parsing.
 * Keys in the returned map are the food's display name (e.g. "Large Strawberry").
 *
 * How to change: if the game changes the file format, update the regex below.
 */

/**
 * Parse a Gourmand eaten-foods text file into a map of food name → eat count.
 * Returns null if the text doesn't contain a "Foods Consumed" section.
 */
export function parseEatenFoods(text: string): Map<string, number> | null {
  const result = new Map<string, number>();

  // Find the "Foods Consumed:" section
  const startIdx = text.indexOf("Foods Consumed:");
  if (startIdx === -1) return null;

  const lines = text.slice(startIdx).split("\n");
  // Skip the header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Stop if we hit another section header (no leading whitespace in original, or a new "X:" header)
    if (!lines[i].startsWith(" ") && !lines[i].startsWith("\t") && line.includes(":") && !line.match(/^\s/)) {
      break;
    }

    // Strip parenthetical tags like "(HAS MEAT)", "(HAS DAIRY)", "(HAS EGGS)"
    const cleaned = line.replace(/\s*\(HAS [^)]+\)/g, "").trim();

    // Parse "Food Name: count"
    const match = cleaned.match(/^(.+?):\s*(\d+)$/);
    if (match) {
      const name = match[1].trim();
      const count = parseInt(match[2], 10);
      if (name && !isNaN(count)) {
        result.set(name, count);
      }
    }
  }

  return result.size > 0 ? result : null;
}
