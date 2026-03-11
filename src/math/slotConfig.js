export const DEFAULT_BALANCE = 1000;
export const BET_OPTIONS = [1, 2, 5, 10, 20, 50, 100, 250, 500];
export const GRID_COLUMNS = 5;
export const GRID_ROWS = 3;

export const SYMBOL_ORDER = [
  "sym1",
  "sym2",
  "sym3",
  "sym4",
  "sym5",
  "sym6",
  "sym7",
  "sym8",
  "sym9",
  "wild",
  "scatter",
  "blank"
];

export const SYMBOL_DEFS = {
  wild: { id: "wild", name: "Wild", icon: "WILD", kind: "wild" },
  sym1: { id: "sym1", name: "Symbol 1", icon: "1", kind: "base" },
  sym2: { id: "sym2", name: "Symbol 2", icon: "2", kind: "base" },
  sym3: { id: "sym3", name: "Symbol 3", icon: "3", kind: "base" },
  sym4: { id: "sym4", name: "Symbol 4", icon: "4", kind: "base" },
  sym5: { id: "sym5", name: "Symbol 5", icon: "5", kind: "base" },
  sym6: { id: "sym6", name: "Symbol 6", icon: "6", kind: "base" },
  sym7: { id: "sym7", name: "Symbol 7", icon: "7", kind: "base" },
  sym8: { id: "sym8", name: "Symbol 8", icon: "8", kind: "base" },
  sym9: { id: "sym9", name: "Symbol 9", icon: "9", kind: "base" },
  scatter: { id: "scatter", name: "Scatter", icon: "BONUS", kind: "scatter" },
  blank: { id: "blank", name: "", icon: "", kind: "blank" }
};

const BASE_PAYTABLE = {
  sym1: { 3: 0.10, 4: 0.20, 5: 0.25 },
  sym2: { 3: 0.10, 4: 0.20, 5: 0.30 },
  sym3: { 3: 0.10, 4: 0.25, 5: 0.35 },
  sym4: { 3: 0.15, 4: 0.30, 5: 0.40 },
  sym5: { 3: 0.15, 4: 0.35, 5: 0.45 },
  sym6: { 3: 0.30, 4: 0.60, 5: 1.50 },
  sym7: { 3: 0.40, 4: 0.80, 5: 2.00 },
  sym8: { 3: 0.50, 4: 1.00, 5: 2.50 },
  sym9: { 3: 0.60, 4: 1.20, 5: 3.00 }
};

function buildStrip(counts, order) {
  const remaining = new Map(
    order
      .filter((symbolId) => (counts[symbolId] ?? 0) > 0)
      .map((symbolId) => [symbolId, counts[symbolId]])
  );
  const strip = [];
  let cursor = 0;

  while (remaining.size > 0) {
    const symbolId = order[cursor % order.length];
    const left = remaining.get(symbolId) ?? 0;

    if (left > 0) {
      strip.push(symbolId);
      if (left === 1) {
        remaining.delete(symbolId);
      } else {
        remaining.set(symbolId, left - 1);
      }
    }

    cursor += 1;
  }

  return strip;
}

function createProfile({
  id,
  label,
  targetRtp,
  volatility,
  description,
  paytable,
  scatterPays,
  bonus,
  stripCounts
}) {
  return {
    id,
    label,
    targetRtp,
    volatility,
    description,
    paytable,
    scatterPays,
    bonus,
    reelStrips: stripCounts.map((counts) => buildStrip(counts, counts.order ?? SYMBOL_ORDER))
  };
}

const COMMON_BONUS_CONFIG = {
  triggerCount: 3,
  freeSpins: { 3: 7, 4: 9, 5: 13 },
  retriggerSpins: {},
  winMultiplier: 1
};

export const SLOT_PROFILES = {
  low: createProfile({
    id: "low",
    label: "Low Volatility",
    targetRtp: 92.4,
    volatility: "Низкая",
    description: "Частые попадания, мягкие фриспины и меньше разброс по крупным выигрышам.",
    paytable: BASE_PAYTABLE,
    scatterPays: {},
    bonus: COMMON_BONUS_CONFIG,
    stripCounts: [
      { sym1: 12, sym2: 12, sym3: 10, sym4: 9, sym5: 8, sym6: 6, sym7: 4, sym8: 3, sym9: 2, wild: 2, scatter: 2, blank: 6 },
      { sym1: 12, sym2: 12, sym3: 10, sym4: 9, sym5: 8, sym6: 6, sym7: 4, sym8: 3, sym9: 2, wild: 2, scatter: 2, blank: 6 },
      { sym1: 11, sym2: 11, sym3: 10, sym4: 8, sym5: 8, sym6: 6, sym7: 4, sym8: 3, sym9: 2, wild: 2, scatter: 2, blank: 7 },
      { sym1: 11, sym2: 10, sym3: 9, sym4: 8, sym5: 7, sym6: 5, sym7: 4, sym8: 3, sym9: 2, wild: 2, scatter: 1, blank: 10 },
      { sym1: 10, sym2: 10, sym3: 9, sym4: 8, sym5: 7, sym6: 5, sym7: 4, sym8: 3, sym9: 2, wild: 2, scatter: 1, blank: 11 }
    ]
  }),
  balanced: createProfile({
    id: "balanced",
    label: "Balanced RTP",
    targetRtp: 95.3,
    volatility: "Средняя",
    description: "Компромисс между частотой базовых попаданий и более заметными бонусными сериями.",
    paytable: BASE_PAYTABLE,
    scatterPays: {},
    bonus: COMMON_BONUS_CONFIG,
    stripCounts: [
      { sym1: 10, sym2: 10, sym3: 8, sym4: 7, sym5: 6, sym6: 5, sym7: 4, sym8: 3, sym9: 2, wild: 1, scatter: 1, blank: 13 },
      { sym1: 10, sym2: 10, sym3: 8, sym4: 7, sym5: 6, sym6: 5, sym7: 4, sym8: 3, sym9: 2, wild: 1, scatter: 1, blank: 13 },
      { sym1: 9, sym2: 9, sym3: 8, sym4: 7, sym5: 6, sym6: 4, sym7: 3, sym8: 3, sym9: 2, wild: 1, scatter: 1, blank: 15 },
      { sym1: 8, sym2: 8, sym3: 7, sym4: 6, sym5: 5, sym6: 4, sym7: 3, sym8: 2, sym9: 2, wild: 1, scatter: 1, blank: 18 },
      { sym1: 8, sym2: 8, sym3: 7, sym4: 6, sym5: 5, sym6: 4, sym7: 3, sym8: 2, sym9: 2, wild: 1, scatter: 1, blank: 19 }
    ]
  }),
  high: createProfile({
    id: "high",
    label: "High Volatility",
    targetRtp: 96.5,
    volatility: "Высокая",
    description: "Редкие базовые выигрыши, реже бонус, но сильнее ценность премиум-символов и фриспинов.",
    paytable: BASE_PAYTABLE,
    scatterPays: {},
    bonus: COMMON_BONUS_CONFIG,
    stripCounts: [
      { sym1: 8, sym2: 8, sym3: 7, sym4: 6, sym5: 5, sym6: 3, sym7: 2, sym8: 2, sym9: 1, wild: 1, scatter: 1, blank: 21 },
      { sym1: 8, sym2: 8, sym3: 7, sym4: 6, sym5: 5, sym6: 3, sym7: 2, sym8: 2, sym9: 1, wild: 1, scatter: 1, blank: 21 },
      { sym1: 7, sym2: 7, sym3: 6, sym4: 5, sym5: 4, sym6: 3, sym7: 2, sym8: 2, sym9: 1, wild: 1, scatter: 1, blank: 24 },
      { sym1: 6, sym2: 6, sym3: 5, sym4: 5, sym5: 4, sym6: 2, sym7: 2, sym8: 1, sym9: 1, wild: 1, scatter: 1, blank: 27 },
      { sym1: 6, sym2: 6, sym3: 5, sym4: 4, sym5: 4, sym6: 2, sym7: 2, sym8: 1, sym9: 1, wild: 1, scatter: 1, blank: 28 }
    ]
  })
};

export const DEFAULT_PROFILE_ID = "balanced";
