import { useEffect } from "react";
import "./index.css";
import { Header } from "./components/layout/Header";
import { TabBar } from "./components/layout/TabBar";
import { Footer } from "./components/layout/Footer";
import { InventoryBrowser } from "./components/inventory/InventoryBrowser";
import { RecipeBrowser } from "./components/recipes/RecipeBrowser";
import { GourmandTracker } from "./components/gourmand/GourmandTracker";
import { CraftingCalculator } from "./components/crafting/CraftingCalculator";
import { SettingsPage } from "./components/import/SettingsPage";
import { CookingPlannerPage } from "./components/planner/CookingPlanner";
import { useNavStore } from "./stores/navStore";
import type { Tab } from "./components/layout/TabBar";

const fullHeightTabs = new Set(["crafting"]);

const DEFAULT_TABS: Tab[] = [
  { id: "inventory", label: "Ingredients" },
  { id: "recipes",   label: "Recipes" },
  { id: "gourmand",  label: "Gourmand" },
  { id: "planner",   label: "Planner" },
  { id: "crafting",  label: "Crafting" },
  { id: "settings",  label: "Settings" },
];

function loadTabOrder(): Tab[] {
  try {
    const saved = localStorage.getItem("tabOrder");
    if (saved) {
      const ids: string[] = JSON.parse(saved);
      // If saved set doesn't match current defaults (tabs added/removed), reset to defaults
      const savedSet = new Set(ids);
      const defaultSet = new Set(DEFAULT_TABS.map((t) => t.id));
      if (savedSet.size !== defaultSet.size || [...defaultSet].some((id) => !savedSet.has(id))) {
        localStorage.removeItem("tabOrder");
        return DEFAULT_TABS;
      }
      const map = new Map(DEFAULT_TABS.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Tab[];
      return ordered;
    }
  } catch {}
  return DEFAULT_TABS;
}

function App() {
  const activeTab = useNavStore((s) => s.activeTab);
  const setActiveTab = useNavStore((s) => s.setActiveTab);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved && saved !== "default") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <TabBar
        defaultTabs={DEFAULT_TABS}
        loadTabOrder={loadTabOrder}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Tab content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Full-height tabs */}
          <div className={`flex flex-1 min-h-0 overflow-hidden ${activeTab !== "crafting" ? "hidden" : ""}`}>
            <CraftingCalculator />
          </div>

          {/* Scrollable tabs */}
          <div className={`flex-1 overflow-y-auto p-4 ${fullHeightTabs.has(activeTab) ? "hidden" : ""}`}>
            <div className="w-full">
              <div className={activeTab !== "inventory" ? "hidden" : ""}><InventoryBrowser /></div>
              <div className={activeTab !== "recipes"   ? "hidden" : ""}><RecipeBrowser /></div>
              <div className={activeTab !== "gourmand"  ? "hidden" : ""}><GourmandTracker /></div>
              <div className={activeTab !== "planner"   ? "hidden" : ""}><CookingPlannerPage /></div>
              <div className={activeTab !== "settings"  ? "hidden" : ""}><SettingsPage /></div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
