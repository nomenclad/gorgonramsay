/**
 * App header displaying the application name, character info (name + server),
 * inventory import date, game data load status, and a Help button.
 * Renders the HelpModal when the user clicks Help.
 */
import { useState } from "react";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";
import { HelpModal } from "./HelpModal";

export function Header() {
  const character = useCharacterStore((s) => s.character);
  const inventoryTimestamp = useInventoryStore((s) => s.importTimestamp);
  const dataLoaded = useGameDataStore((s) => s.loaded);
  const [showHelp, setShowHelp] = useState(false);

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
            <span>
              <span className="text-accent font-medium">
                {character.Character}
              </span>
              <span className="text-text-muted"> @ {character.ServerName}</span>
            </span>
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
            onClick={() => setShowHelp(true)}
            className="px-2 py-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-primary transition-colors"
            title="Help"
          >
            Help
          </button>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  );
}
