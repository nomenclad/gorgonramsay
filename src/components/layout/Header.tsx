import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useGameDataStore } from "../../stores/gameDataStore";

export function Header() {
  const character = useCharacterStore((s) => s.character);
  const inventoryTimestamp = useInventoryStore((s) => s.importTimestamp);
  const dataLoaded = useGameDataStore((s) => s.loaded);

  return (
    <header className="bg-bg-secondary border-b border-border px-4 py-3">
      <div className="max-w-screen-xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-primary">
            PG Efficiency
          </h1>
          <span className="text-xs text-text-muted">
            Project Gorgon Skill Optimizer
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
        </div>
      </div>
    </header>
  );
}
