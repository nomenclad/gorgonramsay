import type { Recipe, Item, XpTable } from "../types";
import type { OptimizerResult } from "../types/optimizer";
import { runOptimizer } from "../lib/optimizer";

export interface WorkerInput {
  skill: string;
  currentLevel: number;
  currentXp: number;
  xpNeededForNext: number;
  targetLevel: number;
  xpTable: XpTable;
  recipes: Recipe[];
  recipeCompletions: Record<string, number>;
  inventory: [number, number][]; // serialized Map entries
  itemsById: [number, Item][]; // serialized Map entries
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  try {
    const {
      skill,
      currentLevel,
      currentXp,
      xpNeededForNext,
      targetLevel,
      xpTable,
      recipes,
      recipeCompletions,
      inventory: inventoryEntries,
      itemsById: itemsByIdEntries,
    } = e.data;

    const inventory = new Map(inventoryEntries);
    const itemsMap = new Map(itemsByIdEntries);

    const result: OptimizerResult = runOptimizer({
      skill,
      currentLevel,
      currentXp,
      xpNeededForNext,
      targetLevel,
      xpTable,
      recipes,
      recipeCompletions,
      inventory,
      getItemByCode: (code) => itemsMap.get(code),
    });

    self.postMessage({ type: "result", result });
  } catch (err) {
    self.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
