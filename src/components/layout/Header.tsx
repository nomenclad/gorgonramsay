/**
 * App header displaying the application name, character selector dropdown,
 * inventory import date, game data load status, and a Help button.
 * Renders the HelpModal when the user clicks Help.
 *
 * When multiple characters are loaded, a dropdown lets the user switch
 * between them. Switching syncs the active character to all stores.
 */
import { useState } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useAltStore } from "../../stores/altStore";
import { HelpModal } from "./HelpModal";
import { ChangelogModal } from "../changelog/ChangelogModal";

export function Header() {
  const character = useCharacterStore((s) => s.character);
  const inventoryTimestamp = useInventoryStore((s) => s.importTimestamp);
  const dataLoaded = useGameDataStore((s) => s.loaded);
  const [showHelp, setShowHelp] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  const alts = useAltStore((s) => s.alts);
  const activeCharId = useAltStore((s) => s.activeCharId);
  const setActiveCharacter = useAltStore((s) => s.setActiveCharacter);

  const hasMultipleChars = alts.size > 1;

  return (
    <header className="bg-bg-secondary border-b border-border px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-primary">
            Gorgon Ramsay
          </h1>
          <span className="text-xs text-text-muted">
            A Culinary Guide to Alharth
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-text-secondary">
          {character ? (
            hasMultipleChars ? (
              <select
                value={activeCharId ?? ""}
                onChange={(e) => setActiveCharacter(e.target.value)}
                className="bg-bg-primary border border-border rounded px-2 py-1 text-xs text-accent font-medium cursor-pointer"
                title="Switch active character"
              >
                {Array.from(alts.values()).map((alt) => (
                  <option key={alt.id} value={alt.id}>
                    {alt.name} @ {alt.server}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                <span className="text-accent font-medium">
                  {character.Character}
                </span>
                <span className="text-text-muted"> @ {character.ServerName}</span>
              </span>
            )
          ) : (
            <span className="text-text-muted">No character loaded</span>
          )}

          {inventoryTimestamp && (
            <span className="text-text-muted">
              Inv: {new Date(inventoryTimestamp).toLocaleDateString()}
            </span>
          )}

          <span
            className={dataLoaded ? "text-success" : "text-text-muted"}
          >
            {dataLoaded ? "Data loaded" : "No game data"}
          </span>

          <button
            onClick={() => setShowChangelog(true)}
            className="px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
            title="What's New — recent updates and feature history"
          >
            Changelog
          </button>

          <button
            onClick={() => setShowHelp(true)}
            className="px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
            title="Help"
          >
            Help
          </button>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </header>
  );
}
