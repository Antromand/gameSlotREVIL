import {
  DEFAULT_PROFILE_ID,
  GRID_COLUMNS,
  GRID_ROWS,
  SLOT_PROFILES,
  SYMBOL_DEFS,
  SYMBOL_ORDER
} from "./slotConfig.js";

const BASE_SYMBOL_IDS = SYMBOL_ORDER.filter((symbolId) => SYMBOL_DEFS[symbolId].kind === "base");
const BONUS_CONFIG_BY_SCATTER_COUNT = {
  3: { spins: 7, wildCountWeights: { 0: 52, 1: 48 }, maxMultiplier: 2, maxStickyWilds: 4 },
  4: { spins: 9, wildCountWeights: { 0: 34, 1: 42, 2: 24 }, maxMultiplier: 5, maxStickyWilds: 6 },
  5: { spins: 13, wildCountWeights: { 0: 18, 1: 39, 2: 28, 3: 15 }, maxMultiplier: 10, maxStickyWilds: 9 }
};
const BONUS_EXTRA_SPINS_BY_SCATTER_COUNT = {
  1: 1,
  2: 3,
  3: 5,
  4: 7,
  5: 15
};
const WILD_MULTIPLIER_WEIGHTS = [
  { value: 1, weight: 480 },
  { value: 2, weight: 220 },
  { value: 3, weight: 120 },
  { value: 4, weight: 75 },
  { value: 5, weight: 45 },
  { value: 6, weight: 28 },
  { value: 7, weight: 16 },
  { value: 8, weight: 9 },
  { value: 9, weight: 5 },
  { value: 10, weight: 2 }
];

function randomIndex(length, rng = Math.random) {
  return Math.floor(rng() * length);
}

function pickWeightedValue(weightMap, rng = Math.random) {
  const entries = Object.entries(weightMap)
    .map(([value, weight]) => ({ value: Number(value), weight }))
    .filter((entry) => entry.weight > 0);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * totalWeight;

  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold < 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1]?.value ?? 0;
}

function countScatter(gridIds) {
  return gridIds.flat().filter((symbolId) => symbolId === "scatter").length;
}

function countWild(gridIds) {
  return gridIds.flat().filter((symbolId) => symbolId === "wild").length;
}

function createEmptyLockedSymbolGrid() {
  return Array.from({ length: GRID_COLUMNS }, () => Array(GRID_ROWS).fill(null));
}

function createEmptyMultiplierGrid() {
  return Array.from({ length: GRID_COLUMNS }, () => Array(GRID_ROWS).fill(null));
}

function cloneLockedSymbolGrid(lockedSymbolGrid = createEmptyLockedSymbolGrid()) {
  return lockedSymbolGrid.map((column) => [...column]);
}

function cloneMultiplierGrid(multiplierGrid = createEmptyMultiplierGrid()) {
  return multiplierGrid.map((column) => [...column]);
}

function collectStickySymbolPositions(
  lockedSymbolGrid = createEmptyLockedSymbolGrid(),
  multiplierGrid = createEmptyMultiplierGrid()
) {
  const positions = [];

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const symbolId = lockedSymbolGrid[column]?.[row] ?? null;
      if (!symbolId) {
        continue;
      }

      positions.push({
        column,
        row,
        symbolId,
        multiplier: symbolId === "wild" ? (multiplierGrid[column]?.[row] ?? 1) : null
      });
    }
  }

  return positions;
}

function collectNewStickyPositions(gridIds, lockedSymbolGrid = createEmptyLockedSymbolGrid()) {
  const newWildPositions = [];
  const newScatterPositions = [];

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (lockedSymbolGrid[column]?.[row]) {
        continue;
      }

      if (gridIds[column][row] === "wild") {
        newWildPositions.push({ column, row });
      }

      if (gridIds[column][row] === "scatter") {
        newScatterPositions.push({ column, row });
      }
    }
  }

  return { newWildPositions, newScatterPositions };
}

function extendLockedSymbolGrid(gridIds, lockedSymbolGrid = createEmptyLockedSymbolGrid()) {
  const nextLockedSymbolGrid = cloneLockedSymbolGrid(lockedSymbolGrid);
  const { newWildPositions, newScatterPositions } = collectNewStickyPositions(gridIds, lockedSymbolGrid);

  for (const position of newWildPositions) {
    nextLockedSymbolGrid[position.column][position.row] = "wild";
  }

  for (const position of newScatterPositions) {
    nextLockedSymbolGrid[position.column][position.row] = "scatter";
  }

  return {
    lockedSymbolGrid: nextLockedSymbolGrid,
    newWildPositions,
    newScatterPositions
  };
}

function pickWeightedWildMultiplier(rng = Math.random) {
  const totalWeight = WILD_MULTIPLIER_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * totalWeight;

  for (const entry of WILD_MULTIPLIER_WEIGHTS) {
    threshold -= entry.weight;
    if (threshold < 0) {
      return entry.value;
    }
  }

  return WILD_MULTIPLIER_WEIGHTS[WILD_MULTIPLIER_WEIGHTS.length - 1].value;
}

function pickWeightedWildMultiplierUpTo(maxValue, rng = Math.random) {
  const availableWeights = WILD_MULTIPLIER_WEIGHTS.filter((entry) => entry.value <= maxValue);
  const totalWeight = availableWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * totalWeight;

  for (const entry of availableWeights) {
    threshold -= entry.weight;
    if (threshold < 0) {
      return entry.value;
    }
  }

  return availableWeights[availableWeights.length - 1]?.value ?? 1;
}

function assignWildMultipliers(gridIds, existingMultiplierGrid, rng = Math.random) {
  const multiplierGrid = cloneMultiplierGrid(existingMultiplierGrid);
  const newWildPositions = [];

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (gridIds[column][row] !== "wild" || multiplierGrid[column][row]) {
        continue;
      }

      multiplierGrid[column][row] = pickWeightedWildMultiplier(rng);
      newWildPositions.push({ column, row, multiplier: multiplierGrid[column][row] });
    }
  }

  return { multiplierGrid, newWildPositions };
}

function calculateWaysPayout(gridIds, wildMultiplierGrid, profile, bet, multiplier = 1) {
  const waysWins = [];
  let totalWin = 0;
  let totalWays = 0;

  for (const symbolId of BASE_SYMBOL_IDS) {
    const rowsPerReel = [];

    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const rows = [];

      for (let row = 0; row < GRID_ROWS; row += 1) {
        const cellId = gridIds[column][row];
        if (cellId === symbolId || cellId === "wild") {
          rows.push(row);
        }
      }

      if (rows.length === 0) {
        break;
      }

      rowsPerReel.push(rows);
    }

    if (rowsPerReel.length < 3) {
      continue;
    }

    const reels = rowsPerReel.length;
    const payoutMultiplier = profile.paytable[symbolId][reels];

    if (!payoutMultiplier) {
      continue;
    }

    const positions = [];
    let ways = 0;
    let payout = 0;

    function visitWay(column, wayMultiplier) {
      if (column >= reels) {
        ways += 1;
        payout += payoutMultiplier * bet * wayMultiplier * multiplier;
        return;
      }

      for (const row of rowsPerReel[column]) {
        positions.push({ column, row });
        const wildCellMultiplier = gridIds[column][row] === "wild"
          ? (wildMultiplierGrid[column][row] ?? 1)
          : 1;
        visitWay(column + 1, wayMultiplier * wildCellMultiplier);
        positions.pop();
      }
    }

    visitWay(0, 1);

    totalWin += payout;
    totalWays += ways;
    waysWins.push({
      symbol: getSymbol(symbolId),
      reels,
      ways,
      payout,
      countLabel: rowsPerReel.map((rows) => rows.length).join("x"),
      positions: collectWinningPositions(gridIds, symbolId, reels)
    });
  }

  return { waysWins, totalWays, totalWaysWin: totalWin };
}

function calculateScatterOutcome(gridIds, profile, bet, inBonus, allowBonus = true) {
  const scatterCount = countScatter(gridIds);
  const scatterPayoutMultiplier = profile.scatterPays[scatterCount] ?? 0;
  const scatterWin = scatterPayoutMultiplier > 0 ? scatterPayoutMultiplier * bet : 0;
  const triggered = allowBonus && scatterCount >= profile.bonus.triggerCount;
  const awardedSpins = triggered
    ? (inBonus ? profile.bonus.retriggerSpins[scatterCount] : profile.bonus.freeSpins[scatterCount]) ?? 0
    : 0;

  return {
    scatterCount,
    scatterWin,
    awardedSpins,
    triggered
  };
}

function createRoundSummary({ gridIds, grid, waysResult, scatterOutcome, bonusTriggered, context }) {
  return {
    context,
    gridIds,
    grid,
    waysWins: waysResult.waysWins,
    totalWays: waysResult.totalWays,
    waysWin: waysResult.totalWaysWin,
    scatterCount: scatterOutcome.scatterCount,
    scatterWin: scatterOutcome.scatterWin,
    bonusTriggered,
    bonusAwardedSpins: scatterOutcome.awardedSpins,
    totalWin: waysResult.totalWaysWin + scatterOutcome.scatterWin
  };
}

function spinSingleRound(profile, bet, rng = Math.random, options = {}) {
  const stopPositions = profile.reelStrips.map((strip) => randomIndex(strip.length, rng));
  const gridIds = profile.reelStrips.map((strip, column) => getVisibleWindow(strip, stopPositions[column]));
  const startingLockedSymbols = cloneLockedSymbolGrid(options.lockedSymbols);
  const startingWildMultipliers = cloneMultiplierGrid(options.lockedWildMultipliers);

  if (options.lockedSymbols) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        if (options.lockedSymbols[column]?.[row]) {
          gridIds[column][row] = options.lockedSymbols[column][row];
        }
      }
    }
  }

  const {
    lockedSymbolGrid,
    newWildPositions,
    newScatterPositions
  } = extendLockedSymbolGrid(gridIds, options.lockedSymbols);
  const { multiplierGrid } = assignWildMultipliers(gridIds, options.lockedWildMultipliers, rng);
  const grid = decorateGrid(gridIds, multiplierGrid);
  const multiplier = options.inBonus ? profile.bonus.winMultiplier : 1;
  const waysResult = calculateWaysPayout(gridIds, multiplierGrid, profile, bet, multiplier);
  const scatterOutcome = calculateScatterOutcome(gridIds, profile, bet, options.inBonus, options.allowBonus ?? true);
  const bonusTriggered = scatterOutcome.triggered;

  return {
    stopPositions,
    lockedSymbols: lockedSymbolGrid,
    wildMultiplierGrid: multiplierGrid,
    startingStickyPositions: collectStickySymbolPositions(startingLockedSymbols, startingWildMultipliers),
    stickyPositions: collectStickySymbolPositions(lockedSymbolGrid, multiplierGrid),
    newWildPositions,
    newScatterPositions,
    wildCount: countWild(gridIds),
    ...createRoundSummary({
      gridIds,
      grid,
      waysResult,
      scatterOutcome,
      bonusTriggered,
      context: options.inBonus ? "bonus" : "base"
    })
  };
}

function playWildRespins(profile, bet, triggeringRound, rng = Math.random) {
  const rounds = [];
  let lockedSymbols = cloneLockedSymbolGrid(triggeringRound.lockedSymbols);
  let lockedWildMultipliers = cloneMultiplierGrid(triggeringRound.wildMultiplierGrid);
  let shouldContinue = triggeringRound.wildCount > 0;

  while (shouldContinue) {
    const round = spinSingleRound(profile, bet, rng, {
      inBonus: false,
      allowBonus: false,
      lockedSymbols,
      lockedWildMultipliers
    });
    rounds.push(round);
    lockedSymbols = cloneLockedSymbolGrid(round.lockedSymbols);
    lockedWildMultipliers = cloneMultiplierGrid(round.wildMultiplierGrid);
    shouldContinue = round.newWildPositions.length > 0;
  }

  return {
    rounds
  };
}

function countLockedWilds(lockedSymbolGrid = createEmptyLockedSymbolGrid()) {
  let count = 0;

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (lockedSymbolGrid[column]?.[row] === "wild") {
        count += 1;
      }
    }
  }

  return count;
}

function collectAvailableBonusWildPositions(gridIds, lockedSymbols = createEmptyLockedSymbolGrid()) {
  const positions = [];

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (lockedSymbols[column]?.[row]) {
        continue;
      }

      positions.push({ column, row });
    }
  }

  return positions;
}

function applyBonusWilds(gridIds, lockedSymbols, lockedWildMultipliers, bonusConfig, rng = Math.random) {
  const nextGridIds = gridIds.map((column) => [...column]);
  const nextLockedSymbols = cloneLockedSymbolGrid(lockedSymbols);
  const nextMultiplierGrid = cloneMultiplierGrid(lockedWildMultipliers);
  const existingStickyWilds = countLockedWilds(lockedSymbols);
  const remainingWildCapacity = Math.max(0, bonusConfig.maxStickyWilds - existingStickyWilds);
  const availablePositions = collectAvailableBonusWildPositions(nextGridIds, lockedSymbols);
  const availableWildSlots = Math.min(remainingWildCapacity, availablePositions.length);
  const plannedWildCount = pickWeightedValue(bonusConfig.wildCountWeights, rng);
  const wildsToAdd = Math.min(plannedWildCount, availableWildSlots);

  const newWildPositions = [];

  for (let index = 0; index < wildsToAdd; index += 1) {
    const pickedIndex = randomIndex(availablePositions.length, rng);
    const [position] = availablePositions.splice(pickedIndex, 1);

    nextGridIds[position.column][position.row] = "wild";
    nextLockedSymbols[position.column][position.row] = "wild";
    nextMultiplierGrid[position.column][position.row] = pickWeightedWildMultiplierUpTo(bonusConfig.maxMultiplier, rng);
    newWildPositions.push({
      ...position,
      multiplier: nextMultiplierGrid[position.column][position.row]
    });
  }

  return {
    gridIds: nextGridIds,
    lockedSymbols: nextLockedSymbols,
    wildMultiplierGrid: nextMultiplierGrid,
    newWildPositions
  };
}

function getNextBonusLevel(currentBonusLevel, scatterCount) {
  if (currentBonusLevel >= 5 || scatterCount < 2) {
    return currentBonusLevel;
  }

  return Math.min(5, currentBonusLevel + 1);
}

function spinBonusRound(profile, bet, currentBonusLevel, lockedSymbols, lockedWildMultipliers, rng = Math.random) {
  const bonusConfig = BONUS_CONFIG_BY_SCATTER_COUNT[currentBonusLevel];
  const stopPositions = profile.reelStrips.map((strip) => randomIndex(strip.length, rng));
  const startingLockedSymbols = cloneLockedSymbolGrid(lockedSymbols);
  const startingWildMultipliers = cloneMultiplierGrid(lockedWildMultipliers);
  const gridIds = profile.reelStrips.map((strip, column) => getVisibleWindowWithOptions(strip, stopPositions[column], {
    excludeSymbolIds: ["wild"]
  }));

  for (let column = 0; column < GRID_COLUMNS; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (lockedSymbols[column]?.[row] === "wild") {
        gridIds[column][row] = "wild";
      }
    }
  }

  const bonusWildResult = applyBonusWilds(gridIds, lockedSymbols, lockedWildMultipliers, bonusConfig, rng);
  const grid = decorateGrid(bonusWildResult.gridIds, bonusWildResult.wildMultiplierGrid);
  const waysResult = calculateWaysPayout(bonusWildResult.gridIds, bonusWildResult.wildMultiplierGrid, profile, bet, 1);
  const scatterOutcome = calculateScatterOutcome(bonusWildResult.gridIds, profile, bet, true, false);
  const extraSpinsAwarded = BONUS_EXTRA_SPINS_BY_SCATTER_COUNT[scatterOutcome.scatterCount] ?? 0;
  const nextBonusLevel = getNextBonusLevel(currentBonusLevel, scatterOutcome.scatterCount);
  const bonusUpgraded = nextBonusLevel > currentBonusLevel;

  return {
    stopPositions,
    lockedSymbols: bonusWildResult.lockedSymbols,
    wildMultiplierGrid: bonusWildResult.wildMultiplierGrid,
    startingStickyPositions: collectStickySymbolPositions(startingLockedSymbols, startingWildMultipliers),
    stickyPositions: collectStickySymbolPositions(bonusWildResult.lockedSymbols, bonusWildResult.wildMultiplierGrid),
    newWildPositions: bonusWildResult.newWildPositions,
    newScatterPositions: [],
    wildCount: countWild(bonusWildResult.gridIds),
    bonusLevel: currentBonusLevel,
    nextBonusLevel,
    bonusUpgraded,
    extraSpinsAwarded,
    maxStickyWilds: bonusConfig.maxStickyWilds,
    maxMultiplier: bonusConfig.maxMultiplier,
    ...createRoundSummary({
      gridIds: bonusWildResult.gridIds,
      grid,
      waysResult,
      scatterOutcome,
      bonusTriggered: false,
      context: "bonus"
    })
  };
}

function playBonusRounds(profile, bet, triggerScatterCount, rng = Math.random) {
  const bonusConfig = BONUS_CONFIG_BY_SCATTER_COUNT[triggerScatterCount];

  if (!bonusConfig) {
    return {
      totalWin: 0,
      totalSpinsAwarded: 0,
      rounds: [],
      retriggers: 0,
      triggerScatterCount
    };
  }

  const rounds = [];
  let totalWin = 0;
  let remainingSpins = bonusConfig.spins;
  let totalSpinsAwarded = bonusConfig.spins;
  let currentBonusLevel = triggerScatterCount;
  let lockedSymbols = createEmptyLockedSymbolGrid();
  let lockedWildMultipliers = createEmptyMultiplierGrid();

  while (remainingSpins > 0) {
    remainingSpins -= 1;
    const round = spinBonusRound(profile, bet, currentBonusLevel, lockedSymbols, lockedWildMultipliers, rng);
    rounds.push(round);
    totalWin += round.totalWin;
    lockedSymbols = cloneLockedSymbolGrid(round.lockedSymbols);
    lockedWildMultipliers = cloneMultiplierGrid(round.wildMultiplierGrid);
    remainingSpins += round.extraSpinsAwarded;
    totalSpinsAwarded += round.extraSpinsAwarded;
    currentBonusLevel = round.nextBonusLevel;
  }

  const finalBonusConfig = BONUS_CONFIG_BY_SCATTER_COUNT[currentBonusLevel] ?? bonusConfig;

  return {
    totalWin,
    totalSpinsAwarded,
    rounds,
    retriggers: 0,
    triggerScatterCount,
    initialBonusLevel: triggerScatterCount,
    finalBonusLevel: currentBonusLevel,
    maxStickyWilds: finalBonusConfig.maxStickyWilds,
    maxWildsPerSpin: finalBonusConfig.maxWildsPerSpin,
    maxMultiplier: finalBonusConfig.maxMultiplier,
    finalStickyWildCount: countLockedWilds(lockedSymbols)
  };
}

export function getProfile(profileId = DEFAULT_PROFILE_ID) {
  return SLOT_PROFILES[profileId] ?? SLOT_PROFILES[DEFAULT_PROFILE_ID];
}

export function getSymbol(symbolId) {
  return SYMBOL_DEFS[symbolId];
}

function getVisibleWindowWithOptions(strip, stopIndex, options = {}) {
  const visible = [];
  let offset = 0;
  const excludedSymbolIds = new Set(options.excludeSymbolIds ?? []);

  while (visible.length < GRID_ROWS) {
    const index = (stopIndex + offset) % strip.length;
    const symbolId = strip[index];

    if (symbolId !== "blank" && !excludedSymbolIds.has(symbolId)) {
      visible.push(symbolId);
    }

    offset += 1;
  }

  return visible;
}

export function getVisibleWindow(strip, stopIndex) {
  return getVisibleWindowWithOptions(strip, stopIndex);
}

export function createPreviewGrid(profileId, rng = Math.random) {
  const profile = getProfile(profileId);
  return profile.reelStrips.map((strip) => {
    const stopIndex = randomIndex(strip.length, rng);
    return decorateColumn(getVisibleWindowWithOptions(strip, stopIndex), Array(GRID_ROWS).fill(null));
  });
}

export function spinFromProfile(profileId, bet, rng = Math.random) {
  const profile = getProfile(profileId);
  const baseRound = spinSingleRound(profile, bet, rng, { inBonus: false, allowBonus: false });
  const respinResult = playWildRespins(profile, bet, baseRound, rng);
  const respinRounds = respinResult.rounds;
  const displayRound = respinRounds[respinRounds.length - 1] ?? baseRound;
  const finalScatterOutcome = calculateScatterOutcome(displayRound.gridIds, profile, bet, false, true);
  const bonusAwardedSpins = finalScatterOutcome.awardedSpins;
  const bonusGame = bonusAwardedSpins > 0
    ? playBonusRounds(profile, bet, finalScatterOutcome.scatterCount, rng)
    : null;
  const finalDisplayRound = bonusGame?.rounds?.[bonusGame.rounds.length - 1] ?? displayRound;
  const respinWin = respinRounds.reduce((sum, round) => sum + round.totalWin, 0);
  const baseAndRespinWin = baseRound.waysWin + respinRounds.reduce((sum, round) => sum + round.waysWin, 0);
  const totalWin = baseAndRespinWin + finalScatterOutcome.scatterWin + (bonusGame?.totalWin ?? 0);

  return {
    profile,
    stopPositions: finalDisplayRound.stopPositions,
    grid: finalDisplayRound.grid,
    gridIds: finalDisplayRound.gridIds,
    totalWin,
    totalWays: finalDisplayRound.totalWays,
    waysWins: finalDisplayRound.waysWins,
    scatterCount: finalScatterOutcome.scatterCount,
    scatterWin: finalScatterOutcome.scatterWin,
    bonusTriggered: bonusAwardedSpins > 0,
    bonusAwardedSpins,
    bonusGame,
    baseRound,
    displayRound,
    finalDisplayRound,
    respinRounds,
    respinWin,
    respinCount: respinRounds.length,
    bonusTriggerSource: bonusAwardedSpins > 0
      ? (respinRounds.length > 0 ? "respin" : "base")
      : null
  };
}

export function buyBonusFromProfile(profileId, bet, scatterCount, rng = Math.random) {
  const profile = getProfile(profileId);
  const bonusGame = playBonusRounds(profile, bet, scatterCount, rng);
  const finalDisplayRound = bonusGame.rounds[bonusGame.rounds.length - 1] ?? null;

  return {
    profile,
    stopPositions: finalDisplayRound?.stopPositions ?? [],
    grid: finalDisplayRound?.grid ?? createPreviewGrid(profileId, rng),
    gridIds: finalDisplayRound?.gridIds ?? [],
    totalWin: bonusGame.totalWin,
    totalWays: finalDisplayRound?.totalWays ?? 0,
    waysWins: finalDisplayRound?.waysWins ?? [],
    scatterCount,
    scatterWin: 0,
    bonusTriggered: true,
    bonusAwardedSpins: bonusGame.totalSpinsAwarded,
    bonusGame,
    baseRound: null,
    displayRound: finalDisplayRound,
    finalDisplayRound,
    respinRounds: [],
    respinWin: 0,
    respinCount: 0,
    bonusTriggerSource: "buy"
  };
}

export function getPaytableRows(profileId) {
  const profile = getProfile(profileId);

  return SYMBOL_ORDER.filter((symbolId) => SYMBOL_DEFS[symbolId].kind !== "blank").map((symbolId) => {
    const symbol = getSymbol(symbolId);

    if (symbol.kind === "scatter") {
      return {
        symbol,
        payouts: profile.scatterPays,
        isScatter: true,
        payoutLabels: { 3: "-", 4: "-", 5: "-" }
      };
    }

    if (symbol.kind === "wild") {
      return {
        symbol,
        payouts: {},
        isScatter: false,
        isWild: true,
        payoutLabels: { 3: "-", 4: "-", 5: "-" }
      };
    }

    return {
      symbol,
      payouts: profile.paytable[symbolId],
      isScatter: false,
      payoutLabels: profile.paytable[symbolId]
    };
  });
}

function collectWinningPositions(gridIds, symbolId, reels) {
  const positions = [];

  for (let column = 0; column < reels; column += 1) {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      if (gridIds[column][row] === symbolId || gridIds[column][row] === "wild") {
        positions.push({ column, row });
      }
    }
  }

  return positions;
}

function decorateGrid(gridIds, multiplierGrid = []) {
  return gridIds.map((column, columnIndex) => decorateColumn(column, multiplierGrid[columnIndex] ?? []));
}

function decorateColumn(columnIds, multiplierColumn = []) {
  return columnIds.map((symbolId, rowIndex) => {
    const symbol = getSymbol(symbolId);
    return {
      ...symbol,
      multiplier: symbol.kind === "wild" ? (multiplierColumn[rowIndex] ?? 1) : null
    };
  });
}
