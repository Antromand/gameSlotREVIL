import { spinFromProfile } from "../src/math/engine.js";
import { BET_OPTIONS, DEFAULT_PROFILE_ID, SLOT_PROFILES } from "../src/math/slotConfig.js";

const DISTRIBUTION_BUCKETS = [
  { label: "0x", min: 0, max: 0 },
  { label: "(0x, 1x)", min: Number.EPSILON, max: 1 },
  { label: "[1x, 2x)", min: 1, max: 2 },
  { label: "[2x, 5x)", min: 2, max: 5 },
  { label: "[5x, 10x)", min: 5, max: 10 },
  { label: "[10x, 25x)", min: 10, max: 25 },
  { label: "[25x, 50x)", min: 25, max: 50 },
  { label: "[50x, 100x)", min: 50, max: 100 },
  { label: "100x+", min: 100, max: Number.POSITIVE_INFINITY }
];

function parseArgs(argv) {
  const args = {
    profile: DEFAULT_PROFILE_ID,
    spins: 100000,
    bet: BET_OPTIONS[0]
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const nextToken = argv[index + 1];

    if (token === "--profile" && nextToken) {
      args.profile = nextToken;
      index += 1;
      continue;
    }

    if (token === "--spins" && nextToken) {
      args.spins = Number(nextToken);
      index += 1;
      continue;
    }

    if (token === "--bet" && nextToken) {
      args.bet = Number(nextToken);
      index += 1;
    }
  }

  return args;
}

function formatPercent(value) {
  return `${value.toFixed(4)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function getBucketLabel(multiplier) {
  for (const bucket of DISTRIBUTION_BUCKETS) {
    if (multiplier === 0 && bucket.label === "0x") {
      return bucket.label;
    }

    if (multiplier >= bucket.min && multiplier < bucket.max && bucket.label !== "0x") {
      return bucket.label;
    }
  }

  return "100x+";
}

function computeStdDeviation(values, mean) {
  if (values.length === 0) {
    return 0;
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function insertTopWin(topWins, entry, limit = 10) {
  topWins.push(entry);
  topWins.sort((left, right) => right.totalWin - left.totalWin);
  if (topWins.length > limit) {
    topWins.length = limit;
  }
}

function runSimulation({ profile, spins, bet }) {
  if (!SLOT_PROFILES[profile]) {
    throw new Error(`Unknown profile "${profile}". Available: ${Object.keys(SLOT_PROFILES).join(", ")}`);
  }

  if (!Number.isInteger(spins) || spins < 1) {
    throw new Error(`Invalid spins "${spins}". Expected positive integer.`);
  }

  if (!Number.isFinite(bet) || bet <= 0) {
    throw new Error(`Invalid bet "${bet}". Expected positive number.`);
  }

  let totalBet = 0;
  let totalWin = 0;
  let hitCount = 0;
  let bonusTriggerCount = 0;
  let totalBonusWin = 0;
  let totalScatterWin = 0;
  let totalBaseWaysWin = 0;
  let totalBonusRounds = 0;
  let totalBonusSpinsAwarded = 0;
  let maxWin = 0;
  const distribution = Object.fromEntries(DISTRIBUTION_BUCKETS.map((bucket) => [bucket.label, 0]));
  const totalWinsBySpin = [];
  const topWins = [];

  for (let spin = 0; spin < spins; spin += 1) {
    const result = spinFromProfile(profile, bet);
    totalBet += bet;
    totalWin += result.totalWin;
    totalScatterWin += result.scatterWin;
    totalBaseWaysWin += result.baseRound.waysWin;
    totalBonusWin += result.bonusGame?.totalWin ?? 0;
    totalBonusRounds += result.bonusGame?.rounds.length ?? 0;
    totalBonusSpinsAwarded += result.bonusGame?.totalSpinsAwarded ?? 0;
    totalWinsBySpin.push(result.totalWin);

    if (result.totalWin > 0) {
      hitCount += 1;
    }

    if (result.bonusTriggered) {
      bonusTriggerCount += 1;
    }

    if (result.totalWin > maxWin) {
      maxWin = result.totalWin;
    }

    const multiplier = result.totalWin / bet;
    distribution[getBucketLabel(multiplier)] += 1;

    insertTopWin(topWins, {
      spin: spin + 1,
      totalWin: result.totalWin,
      multiplier,
      scatterCount: result.scatterCount,
      bonusTriggered: result.bonusTriggered,
      bonusWin: result.bonusGame?.totalWin ?? 0,
      baseWin: result.baseRound.totalWin
    });
  }

  const rtp = (totalWin / totalBet) * 100;
  const hitRate = (hitCount / spins) * 100;
  const bonusRate = (bonusTriggerCount / spins) * 100;
  const meanWin = totalWin / spins;
  const stdDeviation = computeStdDeviation(totalWinsBySpin, meanWin);

  console.log(`Profile: ${profile}`);
  console.log(`Designed target RTP: ${SLOT_PROFILES[profile].targetRtp}%`);
  console.log(`Spins: ${formatNumber(spins)}`);
  console.log(`Bet per spin: ${bet}`);
  console.log(`Total bet: ${formatNumber(totalBet)}`);
  console.log(`Total win: ${formatNumber(totalWin)}`);
  console.log(`Measured RTP: ${formatPercent(rtp)}`);
  console.log(`Hit rate: ${formatPercent(hitRate)}`);
  console.log(`Bonus trigger rate: ${formatPercent(bonusRate)}`);
  console.log(`Base ways win contribution: ${formatNumber(totalBaseWaysWin)} (${formatPercent((totalBaseWaysWin / totalBet) * 100)})`);
  console.log(`Scatter win contribution: ${formatNumber(totalScatterWin)} (${formatPercent((totalScatterWin / totalBet) * 100)})`);
  console.log(`Bonus win contribution: ${formatNumber(totalBonusWin)} (${formatPercent((totalBonusWin / totalBet) * 100)})`);
  console.log(`Average bonus spins awarded: ${bonusTriggerCount === 0 ? "0" : formatNumber(totalBonusSpinsAwarded / bonusTriggerCount)}`);
  console.log(`Total bonus rounds played: ${formatNumber(totalBonusRounds)}`);
  console.log(`Mean win per spin: ${formatNumber(meanWin)}`);
  console.log(`Std deviation per spin: ${formatNumber(stdDeviation)}`);
  console.log(`Max single win: ${formatNumber(maxWin)}`);

  console.log("");
  console.log("Win distribution:");
  DISTRIBUTION_BUCKETS.forEach((bucket) => {
    const count = distribution[bucket.label];
    const share = (count / spins) * 100;
    console.log(`  ${bucket.label.padEnd(12)} ${String(count).padStart(10)} (${formatPercent(share)})`);
  });

  console.log("");
  console.log("Top wins:");
  topWins.forEach((entry, index) => {
    console.log(
      `  ${String(index + 1).padStart(2)}. spin ${entry.spin} | win ${formatNumber(entry.totalWin)} | ${formatNumber(entry.multiplier)}x | base ${formatNumber(entry.baseWin)} | bonus ${formatNumber(entry.bonusWin)} | scatter ${entry.scatterCount} | trigger ${entry.bonusTriggered ? "yes" : "no"}`
    );
  });
}

try {
  runSimulation(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
