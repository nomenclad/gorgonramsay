import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGameDataStore } from "../../stores/gameDataStore";
import { useCharacterStore } from "../../stores/characterStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import {
  parseRecipes,
  buildRecipeIndexes,
} from "../../lib/parsers/recipeParser";
import { parseItems, buildItemIndexes } from "../../lib/parsers/itemParser";
import { parseCharacterSheet } from "../../lib/parsers/characterParser";
import { parseInventory } from "../../lib/parsers/inventoryParser";
import { parseXpTables } from "../../lib/parsers/xpTableParser";
import { parseSourcesData, parseNpcNames } from "../../lib/parsers/sourceParser";

interface ReportFile {
  filename: string;
  path: string;
  modified_timestamp: number;
  file_type: string;
}

async function tryReadFile(path: string): Promise<string | null> {
  try {
    return await invoke<string>("read_file_content", { path });
  } catch {
    return null;
  }
}

export function SettingsPage() {
  const setRecipes = useGameDataStore((s) => s.setRecipes);
  const setItems = useGameDataStore((s) => s.setItems);
  const setXpTables = useGameDataStore((s) => s.setXpTables);
  const setSources = useGameDataStore((s) => s.setSources);
  const setNpcNames = useGameDataStore((s) => s.setNpcNames);
  const setLoading = useGameDataStore((s) => s.setLoading);
  const loading = useGameDataStore((s) => s.loading);
  const loaded = useGameDataStore((s) => s.loaded);
  const sourcesLoaded = useGameDataStore((s) => s.sourcesLoaded);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const setInventory = useInventoryStore((s) => s.setInventory);
  const character = useCharacterStore((s) => s.character);
  const inventoryTimestamp = useInventoryStore((s) => s.importTimestamp);

  const [pgPath, setPgPath] = useState<string | null>(null);
  const [cdnPath, setCdnPath] = useState<string | null>(null);
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [status, setStatus] = useState<string[]>([]);

  const addStatus = useCallback(
    (msg: string) => setStatus((prev) => [...prev, msg]),
    []
  );

  const detectPaths = useCallback(async () => {
    try {
      const pg = await invoke<string | null>("detect_pg_path");
      setPgPath(pg);
      if (pg) {
        addStatus(`✓ Found PG Reports at: ${pg}`);
        const files = await invoke<ReportFile[]>("list_report_files", {
          reportsPath: pg,
        });
        setReportFiles(files);
        addStatus(`  Found ${files.length} report files`);
      } else {
        addStatus("✗ Could not auto-detect PG install path — use drag-and-drop below");
      }

      const cdn = await invoke<string | null>("get_cdn_data_path");
      setCdnPath(cdn);
      if (cdn) {
        addStatus(`✓ Found CDN data at: ${cdn}`);
      } else {
        addStatus("✗ CDN data not found — drag and drop JSON files below");
      }
    } catch (e) {
      addStatus(`Error: ${e}`);
    }
  }, [addStatus]);

  const loadCdnData = useCallback(async () => {
    if (!cdnPath) return;
    setLoading(true);
    setStatus([]);
    try {
      addStatus("Loading recipes...");
      const recipesJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/recipes.json`,
      });
      const recipes = parseRecipes(recipesJson);
      const recipeIndexes = buildRecipeIndexes(recipes);
      setRecipes(recipes, recipeIndexes);
      addStatus(`✓ ${recipes.length} recipes loaded`);

      addStatus("Loading items...");
      const itemsJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/items.json`,
      });
      const items = parseItems(itemsJson);
      const itemIndexes = buildItemIndexes(items);
      setItems(items, itemIndexes);
      addStatus(`✓ ${items.length} items loaded`);

      addStatus("Loading XP tables...");
      const xpJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/xptables.json`,
      });
      const xpTables = parseXpTables(xpJson);
      setXpTables(xpTables);
      addStatus(`✓ ${xpTables.length} XP tables loaded`);

      // Load optional sources and NPC data
      addStatus("Loading item sources...");
      const sourcesJson = await tryReadFile(`${cdnPath}/sources_items.json`);
      if (sourcesJson) {
        const sources = parseSourcesData(sourcesJson);
        setSources(sources);
        addStatus(`✓ Item sources loaded`);
      }

      const npcsJson = await tryReadFile(`${cdnPath}/npcs.json`);
      if (npcsJson) {
        const npcMap = parseNpcNames(npcsJson);
        setNpcNames(npcMap);
        addStatus(`✓ NPC names loaded (${npcMap.size} NPCs)`);
      }

      addStatus("✓ All game data loaded!");
    } catch (e) {
      addStatus(`✗ Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [cdnPath, addStatus, setRecipes, setItems, setXpTables, setSources, setNpcNames, setLoading]);

  const loadCharacter = useCallback(async () => {
    const charFile = reportFiles.find((f) => f.file_type === "character");
    if (!charFile) {
      addStatus("No character file found");
      return;
    }
    try {
      const json = await invoke<string>("read_file_content", {
        path: charFile.path,
      });
      const sheet = parseCharacterSheet(json);
      setCharacter(sheet);
      addStatus(
        `✓ Character loaded: ${sheet.Character} @ ${sheet.ServerName} — ${
          Object.keys(sheet.Skills).length
        } skills, ${Object.keys(sheet.RecipeCompletions).length} recipe completions`
      );
    } catch (e) {
      addStatus(`✗ Error loading character: ${e}`);
    }
  }, [reportFiles, addStatus, setCharacter]);

  const loadInventory = useCallback(async () => {
    const invFiles = reportFiles
      .filter((f) => f.file_type === "inventory")
      .sort((a, b) => b.modified_timestamp - a.modified_timestamp);
    if (invFiles.length === 0) {
      addStatus("No inventory files found");
      return;
    }
    const latest = invFiles[0];
    try {
      const json = await invoke<string>("read_file_content", {
        path: latest.path,
      });
      const inv = parseInventory(json);
      setInventory(inv.Items, inv.Timestamp, inv.Character);
      addStatus(
        `✓ Inventory loaded: ${inv.Items.length} items from "${latest.filename}"`
      );
    } catch (e) {
      addStatus(`✗ Error loading inventory: ${e}`);
    }
  }, [reportFiles, addStatus, setInventory]);

  // Drag-and-drop handler
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      for (const file of files) {
        const text = await file.text();

        if (file.name === "recipes.json") {
          setLoading(true);
          const recipes = parseRecipes(text);
          const indexes = buildRecipeIndexes(recipes);
          setRecipes(recipes, indexes);
          addStatus(`✓ ${recipes.length} recipes loaded (drag-drop)`);
          setLoading(false);
        } else if (file.name === "items.json") {
          setLoading(true);
          const items = parseItems(text);
          const indexes = buildItemIndexes(items);
          setItems(items, indexes);
          addStatus(`✓ ${items.length} items loaded (drag-drop)`);
          setLoading(false);
        } else if (file.name === "xptables.json") {
          const tables = parseXpTables(text);
          setXpTables(tables);
          addStatus(`✓ XP tables loaded (drag-drop)`);
        } else if (file.name === "sources_items.json") {
          const sources = parseSourcesData(text);
          setSources(sources);
          addStatus(`✓ Item sources loaded (drag-drop)`);
        } else if (file.name === "npcs.json") {
          const npcMap = parseNpcNames(text);
          setNpcNames(npcMap);
          addStatus(`✓ NPC data loaded: ${npcMap.size} NPCs (drag-drop)`);
        } else if (file.name.startsWith("Character_")) {
          const sheet = parseCharacterSheet(text);
          setCharacter(sheet);
          addStatus(`✓ Character loaded: ${sheet.Character} (drag-drop)`);
        } else if (file.name.includes("_items_")) {
          const inv = parseInventory(text);
          setInventory(inv.Items, inv.Timestamp, inv.Character);
          addStatus(
            `✓ ${inv.Items.length} inventory items loaded (drag-drop)`
          );
        } else {
          addStatus(`? Unrecognized file: ${file.name}`);
        }
      }
    },
    [addStatus, setRecipes, setItems, setXpTables, setSources, setNpcNames, setCharacter, setInventory, setLoading]
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold">Settings & Data Import</h2>

      {/* Auto-detect */}
      <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-sm">Auto-Detect Game Files</h3>
        <p className="text-xs text-text-muted">
          Automatically finds your PG install and the local CDN data folder.
        </p>
        <button
          onClick={detectPaths}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
        >
          Detect PG Install
        </button>
        {pgPath && (
          <p className="text-xs text-text-muted">Reports: {pgPath}</p>
        )}
        {cdnPath && (
          <p className="text-xs text-text-muted">CDN data: {cdnPath}</p>
        )}
      </section>

      {/* Load buttons */}
      {(pgPath || cdnPath) && (
        <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Load Data</h3>
          <div className="flex flex-wrap gap-2">
            {cdnPath && (
              <button
                onClick={loadCdnData}
                disabled={loading}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {loading ? "Loading..." : loaded ? "↻ Reload Game Data" : "Load Game Data"}
              </button>
            )}
            {reportFiles.some((f) => f.file_type === "character") && (
              <button
                onClick={loadCharacter}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {character ? "↻ Reload Character" : "Load Character"}
              </button>
            )}
            {reportFiles.some((f) => f.file_type === "inventory") && (
              <button
                onClick={loadInventory}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {inventoryTimestamp ? "↻ Reload Inventory" : "Load Latest Inventory"}
              </button>
            )}
          </div>
          {reportFiles.length > 0 && (
            <div className="text-xs text-text-muted space-y-0.5">
              {reportFiles.filter((f) => f.file_type === "inventory").slice(0, 3).map((f) => (
                <div key={f.path}>
                  {f.file_type === "inventory" ? "📦" : "👤"} {f.filename}
                  <span className="ml-2 opacity-60">
                    {new Date(f.modified_timestamp * 1000).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Drag and drop */}
      <section
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-accent transition-colors cursor-pointer"
      >
        <div className="text-2xl mb-2">📂</div>
        <p className="text-text-secondary text-sm font-medium">
          Drag & drop JSON files here
        </p>
        <p className="text-text-muted text-xs mt-1">
          recipes.json · items.json · xptables.json · sources_items.json ·
          npcs.json · Character_*.json · *_items_*.json
        </p>
      </section>

      {/* Status log */}
      {status.length > 0 && (
        <section className="bg-bg-secondary rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-text-secondary">Log</h3>
            <button
              onClick={() => setStatus([])}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Clear
            </button>
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto font-mono">
            {status.map((msg, i) => (
              <p
                key={i}
                className={`text-xs ${
                  msg.startsWith("✓")
                    ? "text-success"
                    : msg.startsWith("✗")
                    ? "text-danger"
                    : "text-text-muted"
                }`}
              >
                {msg}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Current state */}
      <section className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">
          Current State
        </h3>
        <div className="space-y-2">
          <StatusRow
            label="Game Data"
            value={loaded ? "Loaded" : "Not loaded"}
            ok={loaded}
          />
          <StatusRow
            label="Item Sources"
            value={sourcesLoaded ? "Loaded" : "Not loaded"}
            ok={sourcesLoaded}
          />
          <StatusRow
            label="Character"
            value={
              character
                ? `${character.Character} @ ${character.ServerName}`
                : "Not loaded"
            }
            ok={!!character}
          />
          <StatusRow
            label="Inventory"
            value={
              inventoryTimestamp
                ? new Date(inventoryTimestamp).toLocaleString()
                : "Not loaded"
            }
            ok={!!inventoryTimestamp}
          />
        </div>
      </section>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={ok ? "text-success" : "text-text-muted"}>{value}</span>
    </div>
  );
}
