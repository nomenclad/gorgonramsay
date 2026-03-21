import { useState, useMemo } from "react";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useCharacterStore } from "../../stores/characterStore";
import { parseGourmandFoods } from "../../lib/parsers/gourmandParser";
import { invoke } from "@tauri-apps/api/core";

export function GourmandTracker() {
  const getItemByCode = useGameDataStore((s) => s.getItemByCode);
  const loaded = useGameDataStore((s) => s.loaded);
  const getItemQuantity = useInventoryStore((s) => s.getItemQuantity);
  const character = useCharacterStore((s) => s.character);
  const cdnPathRef = useMemo(() => ({ current: null as string | null }), []);

  const [foods, setFoods] = useState<ReturnType<typeof parseGourmandFoods>>([]);
  const [loading, setLoading] = useState(false);
  const [loaded2, setLoaded2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "uneaten" | "owned">("uneaten");

  const gourmandLevel = character
    ? (character.Skills["Gourmand"] ?? 0)
    : 0;

  const completions = character?.RecipeCompletions ?? {};

  async function loadGourmandData() {
    setLoading(true);
    setError(null);
    try {
      // Try to detect CDN path
      const cdn = await invoke<string | null>("get_cdn_data_path");
      if (!cdn) {
        setError("CDN data path not found. Load game data in Settings first.");
        return;
      }
      cdnPathRef.current = cdn;
      const json = await invoke<string>("read_file_content", {
        path: `${cdn}/itemuses.json`,
      });
      const parsed = parseGourmandFoods(json, getItemByCode);
      setFoods(parsed);
      setLoaded2(true);
    } catch (e) {
      setError(`Error loading itemuses.json: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredFoods = useMemo(() => {
    return foods.filter((f) => {
      if (filter === "uneaten") {
        // Show foods not yet eaten (first-time XP still available)
        const internalName = `EatItem:${f.itemCode}`;
        return !completions[internalName] || completions[internalName] === 0;
      }
      if (filter === "owned") {
        return getItemQuantity(f.itemCode) > 0;
      }
      return true;
    });
  }, [foods, filter, completions, getItemQuantity]);

  const uneatenCount = foods.filter((f) => {
    const internalName = `EatItem:${f.itemCode}`;
    return !completions[internalName] || completions[internalName] === 0;
  }).length;

  const ownedUneaten = foods.filter((f) => {
    const internalName = `EatItem:${f.itemCode}`;
    const uneaten = !completions[internalName] || completions[internalName] === 0;
    return uneaten && getItemQuantity(f.itemCode) > 0;
  }).length;

  if (!loaded) {
    return (
      <div className="text-center py-12 text-text-muted">
        Load game data in Settings to use the Gourmand Tracker.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Gourmand Tracker</h2>
          <p className="text-sm text-text-muted mt-1">
            Track which foods grant first-time Gourmand XP — eat them for the bonus!
          </p>
        </div>
        {!loaded2 && (
          <button
            onClick={loadGourmandData}
            disabled={loading}
            className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded text-sm transition-colors shrink-0"
          >
            {loading ? "Loading..." : "Load Food Data"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loaded2 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Gourmand Level" value={gourmandLevel.toString()} />
            <StatCard label="Total Foods" value={foods.length.toString()} />
            <StatCard
              label="Uneaten"
              value={uneatenCount.toString()}
              highlight={uneatenCount > 0}
            />
            <StatCard
              label="Ready to Eat"
              value={ownedUneaten.toString()}
              highlight={ownedUneaten > 0}
              success
            />
          </div>

          {/* Filter */}
          <div className="flex gap-1 bg-bg-secondary rounded-lg p-1 w-fit">
            {(["uneaten", "owned", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded text-sm transition-colors capitalize ${
                  filter === f
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {f === "uneaten"
                  ? `Uneaten (${uneatenCount})`
                  : f === "owned"
                  ? `In Inventory (${ownedUneaten})`
                  : `All (${foods.length})`}
              </button>
            ))}
          </div>

          {/* Food list */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary text-xs">
                  <th className="py-2 px-3">Food</th>
                  <th className="py-2 px-3 text-right">Gourmand XP</th>
                  <th className="py-2 px-3 text-right">In Inventory</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Effects</th>
                </tr>
              </thead>
              <tbody>
                {filteredFoods.map((food) => {
                  const qty = getItemQuantity(food.itemCode);
                  const internalName = `EatItem:${food.itemCode}`;
                  const eaten =
                    completions[internalName] && completions[internalName] > 0;
                  return (
                    <tr
                      key={food.itemCode}
                      className={`border-b border-border/50 hover:bg-bg-secondary/50 ${
                        !eaten && qty > 0 ? "bg-success/5" : ""
                      }`}
                    >
                      <td className="py-2 px-3 font-medium">{food.itemName}</td>
                      <td className="py-2 px-3 text-right text-success font-medium">
                        +{food.gourmandXp.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {qty > 0 ? (
                          <span className="text-success">{qty}</span>
                        ) : (
                          <span className="text-text-muted">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {eaten ? (
                          <span className="text-xs text-text-muted bg-bg-primary px-1.5 py-0.5 rounded">
                            Eaten
                          </span>
                        ) : qty > 0 ? (
                          <span className="text-xs text-success bg-success/10 px-1.5 py-0.5 rounded">
                            Ready to eat!
                          </span>
                        ) : (
                          <span className="text-xs text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                            Need to find
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs text-text-muted max-w-xs truncate">
                        {food.effects
                          .filter(
                            (e) =>
                              !e.includes("SKILL_GOURMAND") &&
                              !e.includes("Gourmand")
                          )
                          .slice(0, 2)
                          .join(", ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredFoods.length === 0 && (
              <div className="text-center py-8 text-text-muted text-sm">
                {filter === "owned"
                  ? "No uneaten Gourmand foods in your inventory."
                  : "No foods match this filter."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  success,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  success?: boolean;
}) {
  return (
    <div className="bg-bg-secondary rounded-lg p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div
        className={`text-xl font-bold ${
          success ? "text-success" : highlight ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
