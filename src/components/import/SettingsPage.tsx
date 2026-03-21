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
import {
  parseInventory,
} from "../../lib/parsers/inventoryParser";
import { parseXpTables } from "../../lib/parsers/xpTableParser";

interface ReportFile {
  filename: string;
  path: string;
  modified_timestamp: number;
  file_type: string;
}

export function SettingsPage() {
  const setRecipes = useGameDataStore((s) => s.setRecipes);
  const setItems = useGameDataStore((s) => s.setItems);
  const setXpTables = useGameDataStore((s) => s.setXpTables);
  const setLoading = useGameDataStore((s) => s.setLoading);
  const loading = useGameDataStore((s) => s.loading);
  const loaded = useGameDataStore((s) => s.loaded);
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
        addStatus(`Found PG Reports at: ${pg}`);
        const files = await invoke<ReportFile[]>("list_report_files", {
          reportsPath: pg,
        });
        setReportFiles(files);
        addStatus(`Found ${files.length} report files`);
      } else {
        addStatus("Could not auto-detect PG install path");
      }

      const cdn = await invoke<string | null>("get_cdn_data_path");
      setCdnPath(cdn);
      if (cdn) {
        addStatus(`Found CDN data at: ${cdn}`);
      }
    } catch (e) {
      addStatus(`Error: ${e}`);
    }
  }, [addStatus]);

  const loadCdnData = useCallback(async () => {
    if (!cdnPath) return;
    setLoading(true);
    try {
      addStatus("Loading recipes...");
      const recipesJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/recipes.json`,
      });
      const recipes = parseRecipes(recipesJson);
      const recipeIndexes = buildRecipeIndexes(recipes);
      setRecipes(recipes, recipeIndexes);
      addStatus(`Loaded ${recipes.length} recipes`);

      addStatus("Loading items...");
      const itemsJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/items.json`,
      });
      const items = parseItems(itemsJson);
      const itemIndexes = buildItemIndexes(items);
      setItems(items, itemIndexes);
      addStatus(`Loaded ${items.length} items`);

      addStatus("Loading XP tables...");
      const xpJson = await invoke<string>("read_file_content", {
        path: `${cdnPath}/xptables.json`,
      });
      const xpTables = parseXpTables(xpJson);
      setXpTables(xpTables);
      addStatus(`Loaded ${xpTables.length} XP tables`);

      addStatus("Game data loaded successfully!");
    } catch (e) {
      addStatus(`Error loading CDN data: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [cdnPath, addStatus, setRecipes, setItems, setXpTables, setLoading]);

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
        `Loaded character: ${sheet.Character} @ ${sheet.ServerName} (${Object.keys(sheet.Skills).length} skills)`
      );
    } catch (e) {
      addStatus(`Error loading character: ${e}`);
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
        `Loaded inventory: ${inv.Items.length} items from ${latest.filename}`
      );
    } catch (e) {
      addStatus(`Error loading inventory: ${e}`);
    }
  }, [reportFiles, addStatus, setInventory]);

  // Drag-and-drop handler for manual file loading
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
          addStatus(`Loaded ${recipes.length} recipes from drag-drop`);
          setLoading(false);
        } else if (file.name === "items.json") {
          setLoading(true);
          const items = parseItems(text);
          const indexes = buildItemIndexes(items);
          setItems(items, indexes);
          addStatus(`Loaded ${items.length} items from drag-drop`);
          setLoading(false);
        } else if (file.name === "xptables.json") {
          const tables = parseXpTables(text);
          setXpTables(tables);
          addStatus(`Loaded ${tables.length} XP tables from drag-drop`);
        } else if (file.name.startsWith("Character_")) {
          const sheet = parseCharacterSheet(text);
          setCharacter(sheet);
          addStatus(`Loaded character ${sheet.Character} from drag-drop`);
        } else if (file.name.includes("_items_")) {
          const inv = parseInventory(text);
          setInventory(inv.Items, inv.Timestamp, inv.Character);
          addStatus(
            `Loaded ${inv.Items.length} inventory items from drag-drop`
          );
        }
      }
    },
    [addStatus, setRecipes, setItems, setXpTables, setCharacter, setInventory, setLoading]
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold">Settings & Data Import</h2>

      {/* Auto-detect */}
      <section className="bg-bg-secondary rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-text-secondary">
          Auto-Detect Game Files
        </h3>
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
          <h3 className="text-sm font-medium text-text-secondary">
            Load Data
          </h3>
          <div className="flex flex-wrap gap-2">
            {cdnPath && (
              <button
                onClick={loadCdnData}
                disabled={loading}
                className="bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {loading ? "Loading..." : loaded ? "Reload Game Data" : "Load Game Data"}
              </button>
            )}
            {reportFiles.some((f) => f.file_type === "character") && (
              <button
                onClick={loadCharacter}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {character ? "Reload Character" : "Load Character"}
              </button>
            )}
            {reportFiles.some((f) => f.file_type === "inventory") && (
              <button
                onClick={loadInventory}
                className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm transition-colors"
              >
                {inventoryTimestamp
                  ? "Reload Inventory"
                  : "Load Latest Inventory"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Drag and drop */}
      <section
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-accent transition-colors"
      >
        <p className="text-text-secondary text-sm">
          Drag & drop JSON files here
        </p>
        <p className="text-text-muted text-xs mt-1">
          Accepts: recipes.json, items.json, xptables.json, Character_*.json,
          *_items_*.json
        </p>
      </section>

      {/* Status log */}
      {status.length > 0 && (
        <section className="bg-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-2">
            Log
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {status.map((msg, i) => (
              <p key={i} className="text-xs text-text-muted font-mono">
                {msg}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Current state summary */}
      <section className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-2">
          Current State
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>Game Data:</div>
          <div className={loaded ? "text-success" : "text-text-muted"}>
            {loaded ? "Loaded" : "Not loaded"}
          </div>
          <div>Character:</div>
          <div
            className={character ? "text-success" : "text-text-muted"}
          >
            {character
              ? `${character.Character} @ ${character.ServerName}`
              : "Not loaded"}
          </div>
          <div>Inventory:</div>
          <div
            className={
              inventoryTimestamp ? "text-success" : "text-text-muted"
            }
          >
            {inventoryTimestamp
              ? new Date(inventoryTimestamp).toLocaleString()
              : "Not loaded"}
          </div>
        </div>
      </section>
    </div>
  );
}
