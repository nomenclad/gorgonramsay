import { useState } from "react";
import "./index.css";
import { Header } from "./components/layout/Header";
import { TabBar, type Tab } from "./components/layout/TabBar";
import { Footer } from "./components/layout/Footer";
import { SkillOptimizer } from "./components/optimizer/SkillOptimizer";
import { InventoryBrowser } from "./components/inventory/InventoryBrowser";
import { RecipeBrowser } from "./components/recipes/RecipeBrowser";
import { SettingsPage } from "./components/import/SettingsPage";

const tabs: Tab[] = [
  { id: "optimizer", label: "Skill Optimizer" },
  { id: "inventory", label: "Inventory" },
  { id: "recipes", label: "Recipes" },
  { id: "settings", label: "Settings" },
];

function App() {
  const [activeTab, setActiveTab] = useState("optimizer");

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-4 max-w-screen-xl mx-auto w-full">
        {activeTab === "optimizer" && <SkillOptimizer />}
        {activeTab === "inventory" && <InventoryBrowser />}
        {activeTab === "recipes" && <RecipeBrowser />}
        {activeTab === "settings" && <SettingsPage />}
      </main>
      <Footer />
    </div>
  );
}

export default App;
