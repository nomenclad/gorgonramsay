/**
 * Guide for combat skill leveling, shown when a skill has no crafting recipes.
 * Displays level-band recommendations, area suggestions, XP mechanics, and
 * skill-specific tips. Data is static (COMBAT_GUIDANCE / GENERIC_LEVEL_BANDS).
 * To add guidance for a new combat skill, add an entry to COMBAT_GUIDANCE.
 */

interface Props {
  skill: string;
  currentLevel: number;
  targetLevel: number;
}

interface LevelRange {
  minSkill: number;
  maxSkill: number;
  tips: string[];
  areas?: string[];
}

// General PG combat XP guidance: fight enemies ~5-15 levels below your skill
const COMBAT_GUIDANCE: Record<string, LevelRange[]> = {
  Sword: [
    { minSkill: 1, maxSkill: 25, tips: ["Start in Serbule with rats and wolves"], areas: ["Serbule"] },
    { minSkill: 25, maxSkill: 50, tips: ["Serbule crypt, Kur Mountains"], areas: ["Serbule Crypt", "Kur Mountains"] },
    { minSkill: 50, maxSkill: 75, tips: ["Rahu, Povus"], areas: ["Rahu", "Povus"] },
    { minSkill: 75, maxSkill: 100, tips: ["War Cache, Gazluk"], areas: ["War Cache", "Gazluk"] },
  ],
  Hammer: [
    { minSkill: 1, maxSkill: 25, tips: ["Start in Serbule with rats and wolves"], areas: ["Serbule"] },
    { minSkill: 25, maxSkill: 50, tips: ["Serbule crypt or Kur Mountains wolves"], areas: ["Serbule Crypt", "Kur Mountains"] },
    { minSkill: 50, maxSkill: 75, tips: ["Rahu, Povus"], areas: ["Rahu", "Povus"] },
    { minSkill: 75, maxSkill: 100, tips: ["War Cache, Gazluk"], areas: ["War Cache", "Gazluk"] },
  ],
  Archery: [
    { minSkill: 1, maxSkill: 25, tips: ["Serbule — deer and wolves"], areas: ["Serbule"] },
    { minSkill: 25, maxSkill: 50, tips: ["Kur Mountains, Red Wing Casino"], areas: ["Kur Mountains", "Red Wing Casino"] },
    { minSkill: 50, maxSkill: 75, tips: ["Rahu, Povus"], areas: ["Rahu", "Povus"] },
  ],
  FireMagic: [
    { minSkill: 1, maxSkill: 30, tips: ["Serbule or Eltibule — area AoE on groups"], areas: ["Serbule", "Eltibule"] },
    { minSkill: 30, maxSkill: 60, tips: ["Kur Mountains, Red Wing Casino"], areas: ["Kur Mountains", "Red Wing Casino"] },
    { minSkill: 60, maxSkill: 90, tips: ["Rahu, Povus, Sun Vale"], areas: ["Rahu", "Povus", "Sun Vale"] },
  ],
  IceMagic: [
    { minSkill: 1, maxSkill: 30, tips: ["Serbule or Eltibule"], areas: ["Serbule", "Eltibule"] },
    { minSkill: 30, maxSkill: 60, tips: ["Kur Mountains (cold-resistant enemies recommended)"], areas: ["Kur Mountains"] },
    { minSkill: 60, maxSkill: 90, tips: ["Rahu, Povus"], areas: ["Rahu", "Povus"] },
  ],
};

const GENERIC_LEVEL_BANDS = [
  { minSkill: 1, maxSkill: 20, areas: ["Serbule"], enemyLevelHint: "5–15" },
  { minSkill: 20, maxSkill: 40, areas: ["Serbule Crypt", "Eltibule", "Kur Mountains"], enemyLevelHint: "15–30" },
  { minSkill: 40, maxSkill: 60, areas: ["Red Wing Casino", "Kur Mountains", "Ilmari"], enemyLevelHint: "30–50" },
  { minSkill: 60, maxSkill: 80, areas: ["Rahu", "Povus", "Sun Vale"], enemyLevelHint: "50–70" },
  { minSkill: 80, maxSkill: 100, areas: ["Gazluk", "War Cache", "Fae Realm"], enemyLevelHint: "65–85" },
  { minSkill: 100, maxSkill: 125, areas: ["Wintertide", "Kur Tower"], enemyLevelHint: "80–100+" },
];

export function CombatSkillGuide({ skill, currentLevel, targetLevel }: Props) {
  // Find appropriate level bands covering current → target
  const relevantBands = GENERIC_LEVEL_BANDS.filter(
    (b) => b.maxSkill > currentLevel && b.minSkill < targetLevel
  );

  const specificGuidance = COMBAT_GUIDANCE[skill];
  const currentBand = GENERIC_LEVEL_BANDS.find(
    (b) => currentLevel >= b.minSkill && currentLevel < b.maxSkill
  );

  const xpTip = currentLevel >= 1 && currentLevel < 30
    ? "Fight enemies 5–10 levels below your skill level for maximum XP. Too low = no XP; too high = full XP but riskier."
    : "At higher levels, enemies 10–15 below your level give good XP with low risk. Consider group content for better XP/hour.";

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚔️</span>
          <div>
            <div className="font-medium text-sm mb-1">Combat Skill — Manual Grinding Required</div>
            <p className="text-xs text-text-muted">
              <strong>{skill}</strong> is a combat/activity skill with no crafting recipes.
              XP comes from defeating enemies or performing the skill's activity.
              The optimizer can't plan an exact route, but here's guidance based on your level.
            </p>
          </div>
        </div>
      </div>

      {/* XP Rule */}
      <div className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2">XP Mechanics</h3>
        <p className="text-xs text-text-muted">{xpTip}</p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div className="bg-success/10 rounded p-2 text-center">
            <div className="text-success font-medium">Optimal</div>
            <div className="text-text-muted">Enemy 5–15 lvl below</div>
          </div>
          <div className="bg-gold/10 rounded p-2 text-center">
            <div className="text-gold font-medium">Reduced XP</div>
            <div className="text-text-muted">Enemy 15+ lvl below</div>
          </div>
          <div className="bg-danger/10 rounded p-2 text-center">
            <div className="text-danger font-medium">No XP</div>
            <div className="text-text-muted">Enemy too far below</div>
          </div>
        </div>
      </div>

      {/* Current area recommendation */}
      {currentBand && (
        <div className="bg-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2">
            Recommended Areas — Lv {currentLevel} {skill}
          </h3>
          <div className="space-y-2">
            <div className="text-xs text-text-muted">
              Target enemy levels: approximately <strong>{currentBand.enemyLevelHint}</strong>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {currentBand.areas.map((area) => (
                <span
                  key={area}
                  className="bg-accent/10 text-accent text-xs px-2.5 py-1 rounded-full"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Full level roadmap */}
      {relevantBands.length > 1 && (
        <div className="bg-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">
            Leveling Roadmap: {currentLevel} → {targetLevel}
          </h3>
          <div className="space-y-3">
            {relevantBands.map((band) => {
              const bandStart = Math.max(band.minSkill, currentLevel);
              const bandEnd = Math.min(band.maxSkill, targetLevel);
              const isCurrent = currentLevel >= band.minSkill && currentLevel < band.maxSkill;
              return (
                <div
                  key={band.minSkill}
                  className={`flex gap-3 items-start ${isCurrent ? "opacity-100" : "opacity-70"}`}
                >
                  <div
                    className={`shrink-0 text-xs px-2 py-0.5 rounded font-mono mt-0.5 ${
                      isCurrent
                        ? "bg-accent text-white"
                        : "bg-bg-primary text-text-muted"
                    }`}
                  >
                    {bandStart}–{bandEnd}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {band.areas.map((area) => (
                        <span
                          key={area}
                          className="text-xs bg-bg-primary text-text-secondary px-2 py-0.5 rounded"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      Fight enemies ~{band.enemyLevelHint}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skill-specific tips */}
      {specificGuidance && (
        <div className="bg-bg-secondary rounded-lg p-4">
          <h3 className="text-sm font-medium mb-2">{skill}-Specific Tips</h3>
          <ul className="space-y-1">
            {specificGuidance
              .filter((g) => g.maxSkill > currentLevel && g.minSkill < targetLevel)
              .flatMap((g) => g.tips)
              .map((tip, i) => (
                <li key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">•</span>
                  {tip}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* General tips */}
      <div className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-sm font-medium mb-2">General Tips</h3>
        <ul className="space-y-1.5 text-xs text-text-muted">
          <li className="flex gap-1.5"><span className="text-accent">•</span> Use Mentalism's "Animal Handling" or "Battle Chemistry" buffs to boost combat XP.</li>
          <li className="flex gap-1.5"><span className="text-accent">•</span> First-time kill bonuses: each unique enemy type gives a one-time XP bonus — explore new areas.</li>
          <li className="flex gap-1.5"><span className="text-accent">•</span> Group with others for tougher enemies without the death penalty risk.</li>
          <li className="flex gap-1.5"><span className="text-accent">•</span> Check the Serbule council vault — purchase XP potions and buffs from other players.</li>
        </ul>
      </div>
    </div>
  );
}
