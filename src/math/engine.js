import {
  DEFAULT_PROFILE_ID,
  GRID_COLUMNS,
  GRID_ROWS,
  SLOT_PROFILES,
  SYMBOL_DEFS,
  SYMBOL_ORDER
} from "./slotConfig.js";

const BASE_SYMBOL_IDS = SYMBOL_ORDER.filter((symbolId) => SYMBOL_DEFS[symbolId].kind === "base");

function randomIndex(length, rng = Math.random) {
  return Math.floor(rng() * length);
}

function countScatter(gridIds) {
  return gridIds.flat().filter((symbolId) => symbolId === "scatter").length;
}

function calculateWaysPayout(gridIds, profile, bet, multiplier = 1) {
  const waysWins = [];
  let totalWin = 0;
  let totalWays = 0;

  for (const symbolId of BASE_SYMBOL_IDS) {
    const countsPerReel = [];

    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      const count = gridIds[column].filter((cellId) => cellId === symbolId || cellId === "wild").length;
      if (count === 0) {
        break;
      }
      countsPerReel.push(count);
    }

    if (countsPerReel.length < 3) {
      continue;
    }

    const reels = countsPerReel.length;
    const ways = countsPerReel.reduce((product, value) => product * value, 1);
    const payoutMultiplier = profile.paytable[symbolId][reels];

    if (!payoutMultiplier) {
      continue;
    }

    const payout = payoutMultiplier * bet * ways * multiplier;
    totalWin += payout;
    totalWays += ways;
    waysWins.push({
      symbol: getSymbol(symbolId),
      reels,
      ways,
      payout,
      countLabel: countsPerReel.join("x"),
      positions: collectWinningPositions(gridIds, symbolId, reels)
    });
  }

  return { waysWins, totalWays, totalWaysWin: totalWin };
}

function calculateScatterOutcome(gridIds, profile, bet, inBonus) {
  const scatterCount = countScatter(gridIds);
  const scatterPayoutMultiplier = profile.scatterPays[scatterCount] ?? 0;
  const scatterWin = scatterPayoutMultiplier > 0 ? scatterPayoutMultiplier * bet : 0;
  const triggered = scatterCount >= profile.bonus.triggerCount;
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
  const grid = decorateGrid(gridIds);
  const multiplier = options.inBonus ? profile.bonus.winMultiplier : 1;
  const waysResult = calculateWaysPayout(gridIds, profile, bet, multiplier);
  const scatterOutcome = calculateScatterOutcome(gridIds, profile, bet, options.inBonus);
  const bonusTriggered = scatterOutcome.triggered;

  return {
    stopPositions,
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

function playBonusRounds(profile, bet, initialSpins, rng = Math.random) {
  const rounds = [];
  let totalWin = 0;
  let remainingSpins = initialSpins;
  let awardedSpins = initialSpins;
  let retriggers = 0;

  while (remainingSpins > 0) {
    remainingSpins -= 1;
    const round = spinSingleRound(profile, bet, rng, { inBonus: true });
    rounds.push(round);
    totalWin += round.totalWin;

    if (round.bonusTriggered && round.bonusAwardedSpins > 0) {
      remainingSpins += round.bonusAwardedSpins;
      awardedSpins += round.bonusAwardedSpins;
      retriggers += 1;
    }
  }

  return {
    totalWin,
    totalSpinsAwarded: awardedSpins,
    rounds,
    retriggers
  };
}

export function getProfile(profileId = DEFAULT_PROFILE_ID) {
  return SLOT_PROFILES[profileId] ?? SLOT_PROFILES[DEFAULT_PROFILE_ID];
}

export function getSymbol(symbolId) {
  return SYMBOL_DEFS[symbolId];
}

export function getVisibleWindow(strip, stopIndex) {
  const visible = [];
  let offset = 0;

  while (visible.length < GRID_ROWS) {
    const index = (stopIndex + offset) % strip.length;
    const symbolId = strip[index];

    if (symbolId !== "blank") {
      visible.push(symbolId);
    }

    offset += 1;
  }

  return visible;
}

export function createPreviewGrid(profileId, rng = Math.random) {
  const profile = getProfile(profileId);
  return profile.reelStrips.map((strip) => {
    const stopIndex = randomIndex(strip.length, rng);
    return decorateColumn(getVisibleWindow(strip, stopIndex));
  });
}

export function spinFromProfile(profileId, bet, rng = Math.random) {
  const profile = getProfile(profileId);
  const baseRound = spinSingleRound(profile, bet, rng, { inBonus: false });
  const bonusGame = baseRound.bonusTriggered && baseRound.bonusAwardedSpins > 0
    ? playBonusRounds(profile, bet, baseRound.bonusAwardedSpins, rng)
    : null;

  const totalWin = baseRound.totalWin + (bonusGame?.totalWin ?? 0);

  return {
    profile,
    stopPositions: baseRound.stopPositions,
    grid: baseRound.grid,
    gridIds: baseRound.gridIds,
    totalWin,
    totalWays: baseRound.totalWays,
    waysWins: baseRound.waysWins,
    scatterCount: baseRound.scatterCount,
    scatterWin: baseRound.scatterWin,
    bonusTriggered: baseRound.bonusTriggered,
    bonusAwardedSpins: baseRound.bonusAwardedSpins,
    bonusGame,
    baseRound
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

function decorateGrid(gridIds) {
  return gridIds.map((column) => decorateColumn(column));
}

function decorateColumn(columnIds) {
  return columnIds.map((symbolId) => getSymbol(symbolId));
}
