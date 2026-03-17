import React, { Component, useEffect, useRef, useState } from "react";
import {
  BET_OPTIONS,
  DEFAULT_BALANCE,
  DEFAULT_PROFILE_ID,
  SLOT_PROFILES
} from "./math/slotConfig.js";
import {
  buyBonusFromProfile,
  createPreviewGrid,
  getPaytableRows,
  getProfile,
  spinFromProfile
} from "./math/engine.js";
import { t } from "./i18n/index.js";

const SPEED_OPTIONS = [
  { id: "standard", label: "1x", spinBase: 2200, spinStep: 720, previewStep: 44, settleStep: 132, stripStepMs: 1120 },
  { id: "fast", label: "2x", spinBase: 700, spinStep: 220, previewStep: 30, settleStep: 88, stripStepMs: 280 },
  { id: "hyper", label: "3x", spinBase: 180, spinStep: 68, previewStep: 16, settleStep: 40, stripStepMs: 280 }
];
const BASE_STAGE_WIDTH = 1024;
const BASE_STAGE_HEIGHT = 768;

const AUTO_SPIN_OPTIONS = [10, 25, 50, 100];
const BIG_WIN_OPTIONS = [0, 10, 25, 50, 100];
const BONUS_BUY_OPTIONS = [
  { scatterCount: 3, priceMultiplier: 100 },
  { scatterCount: 4, priceMultiplier: 200 },
  { scatterCount: 5, priceMultiplier: 500 }
];

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatCompactNumber(value) {
  if (value >= 1000) {
    return `${Math.floor(value / 1000)}k`;
  }
  return String(value);
}

function advanceSpinningColumn(currentColumn, previewColumn) {
  if (currentColumn.length === 0) {
    return previewColumn;
  }

  return [
    currentColumn[1] ?? previewColumn[0],
    currentColumn[2] ?? previewColumn[1] ?? previewColumn[0],
    previewColumn[previewColumn.length - 1] ?? currentColumn[currentColumn.length - 1]
  ];
}

function getSpinFrameDelay(elapsed, totalDuration, speedOption) {
  const baseDelay = speedOption.previewStep;
  const maxDelay = speedOption.settleStep;
  const decelerationStart = totalDuration * 0.58;

  if (elapsed <= decelerationStart) {
    return baseDelay;
  }

  const progress = Math.min(1, (elapsed - decelerationStart) / Math.max(1, totalDuration - decelerationStart));
  const easedProgress = 1 - ((1 - progress) ** 3);
  return Math.round(baseDelay + (maxDelay - baseDelay) * easedProgress);
}

function getColumnSpinProfile(column, speedOption) {
  const cascadeFactor = column / 4;

  return {
    totalDuration: speedOption.spinBase + column * speedOption.spinStep + Math.round(cascadeFactor * speedOption.spinStep * 0.75),
    previewStep: speedOption.previewStep + Math.round(cascadeFactor * 4),
    settleStep: speedOption.settleStep + Math.round(cascadeFactor * 26)
  };
}

function countColumnScatters(grid, settledColumns) {
  return settledColumns.reduce((total, columnIndex) => {
    const hasScatter = grid[columnIndex]?.some((symbol) => symbol.id === "scatter");
    return total + (hasScatter ? 1 : 0);
  }, 0);
}

function createSpinningColumnItems(initialColumn, finalColumn, fillerColumns) {
  const columns = [initialColumn, ...fillerColumns, finalColumn];

  return columns.flatMap((column, repeatIndex) => (
    column.map((symbol, rowIndex) => ({
      symbol,
      rowIndex,
      repeatIndex
    }))
  ));
}

function getSpinVisualStyle(speedId) {
  if (speedId === "hyper") {
    return {
      "--reel-track-duration": "120ms",
      "--reel-blur-duration": "70ms",
      "--reel-trail-duration": "70ms"
    };
  }

  if (speedId === "fast") {
    return {
      "--reel-track-duration": "220ms",
      "--reel-blur-duration": "95ms",
      "--reel-trail-duration": "95ms"
    };
  }

  return {
    "--reel-track-duration": "3040ms",
    "--reel-blur-duration": "210ms",
    "--reel-trail-duration": "210ms"
  };
}

function formatRtpValue(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function getFeatureSummary(plannedSpin, bonusInfo) {
  if ((plannedSpin.respinCount ?? 0) <= 0) {
    return bonusInfo;
  }

  return t("feature.respinSummary", {
    count: plannedSpin.respinCount,
    win: formatNumber(plannedSpin.respinWin ?? 0),
    bonusInfo
  });
}

function renderFormattedRuleText(text) {
  return text.split("\n").map((line, index) => {
    const trimmedLine = line.trim();
    const isHeading = /^(3|4|5) scatter:$/.test(trimmedLine);

    return (
      <span
        className={`formatted-rule-line${isHeading ? " is-heading" : ""}`}
        key={`formatted-rule-${index}-${trimmedLine}`}
      >
        {trimmedLine}
      </span>
    );
  });
}

function AssetButton({ shellClassName, artClassName, label, onClick, disabled = false, ariaLabel, children }) {
  return (
    <div className={`asset-button-shell ${shellClassName}${disabled ? " is-disabled" : ""}`}>
      <span className={artClassName} aria-hidden="true" />
      {children}
      <button
        className="asset-button-hitbox"
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel ?? label}
      >
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
function SlotApp() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [balance, setBalance] = useState(DEFAULT_BALANCE);
  const [currentBetIndex, setCurrentBetIndex] = useState(2);
  const [lastWin, setLastWin] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [displayGrid, setDisplayGrid] = useState(() => createPreviewGrid(DEFAULT_PROFILE_ID));
  const [waysWins, setWaysWins] = useState([]);
  const [totalBets, setTotalBets] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [speedId, setSpeedId] = useState("standard");
  const [activeSpinSpeedId, setActiveSpinSpeedId] = useState("standard");
  const [autoSpinCount, setAutoSpinCount] = useState(AUTO_SPIN_OPTIONS[0]);
  const [autoSpinsRemaining, setAutoSpinsRemaining] = useState(0);
  const [stopOnBonus, setStopOnBonus] = useState(true);
  const [stopOnBigWin, setStopOnBigWin] = useState(25);
  const [lastFeatureText, setLastFeatureText] = useState(t("feature.defaultHint"));
  const [bonusBanner, setBonusBanner] = useState(t("feature.bonusInactive"));
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBuyBonusModal, setShowBuyBonusModal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [viewportScale, setViewportScale] = useState(1);
  const [spinningColumns, setSpinningColumns] = useState([]);
  const [settlingColumns, setSettlingColumns] = useState([]);
  const [spinningStripColumns, setSpinningStripColumns] = useState([]);
  const [spinningStripStyles, setSpinningStripStyles] = useState([]);
  const [stickySpecialOverlays, setStickySpecialOverlays] = useState([]);
  const [activeBonusState, setActiveBonusState] = useState(null);
  const [bonusEventState, setBonusEventState] = useState(null);
  const [statusText, setStatusText] = useState(t("status.ready"));
  const [roundSummary, setRoundSummary] = useState(t("status.firstSpin"));
  const timersRef = useRef([]);
  const intervalsRef = useRef([]);
  const autoSpinQueuedRef = useRef(false);
  const autoSpinStopRequestedRef = useRef(false);
  const audioContextRef = useRef(null);
  const teasePlayedColumnsRef = useRef(new Set());
  const displayGridRef = useRef(displayGrid);

  const profile = getProfile(profileId);
  const bet = BET_OPTIONS[currentBetIndex];
  const paytableRows = getPaytableRows(profileId);
  const speedOption = SPEED_OPTIONS.find((option) => option.id === speedId) ?? SPEED_OPTIONS[0];
  const activeSpinSpeedOption = SPEED_OPTIONS.find((option) => option.id === activeSpinSpeedId) ?? SPEED_OPTIONS[0];
  const currentSpinSpeedOption = spinning ? activeSpinSpeedOption : speedOption;
  const spinVisualStyle = getSpinVisualStyle(currentSpinSpeedOption.id);
  const sessionRtp = totalBets === 0 ? 0 : (totalWins / totalBets) * 100;
  const totalWays = waysWins.reduce((sum, entry) => sum + entry.ways, 0);

  useEffect(() => {
    displayGridRef.current = displayGrid;
  }, [displayGrid]);

  useEffect(() => {
    return () => {
      clearSpinTimers();
    };
  }, []);

  useEffect(() => {
    function updateViewportScale() {
      const nextScale = Math.min(
        window.innerWidth / BASE_STAGE_WIDTH,
        window.innerHeight / BASE_STAGE_HEIGHT
      );
      setViewportScale(Number.isFinite(nextScale) ? nextScale : 1);
    }

    updateViewportScale();
    window.addEventListener("resize", updateViewportScale);

    return () => {
      window.removeEventListener("resize", updateViewportScale);
    };
  }, []);

  function clearSpinTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    intervalsRef.current.forEach((interval) => window.clearInterval(interval));
    timersRef.current = [];
    intervalsRef.current = [];
  }

  function playScatterTease() {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;

    if (!soundEnabled || !AudioContextCtor) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    const context = audioContextRef.current;

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.14);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  function toggleSound() {
    setSoundEnabled((value) => !value);
  }

  function maybePlayScatterTease(grid, stoppedColumn) {
    const settledColumns = Array.from({ length: stoppedColumn + 1 }, (_, index) => index);
    const scatterColumns = countColumnScatters(grid, settledColumns);
    const remainingColumns = grid.length - settledColumns.length;
    const canStillReachBonus = scatterColumns >= 2 && scatterColumns + remainingColumns >= profile.bonus.triggerCount;

    if (!canStillReachBonus || teasePlayedColumnsRef.current.has(stoppedColumn)) {
      return;
    }

    teasePlayedColumnsRef.current.add(stoppedColumn);
    playScatterTease();
  }

  function resetSession(nextProfileId) {
    clearSpinTimers();

    setProfileId(nextProfileId);
    setBalance(DEFAULT_BALANCE);
    setCurrentBetIndex(2);
    setLastWin(0);
    setSpinning(false);
    setWaysWins([]);
    setTotalBets(0);
    setTotalWins(0);
    setSpeedId("standard");
    setActiveSpinSpeedId("standard");
    setAutoSpinCount(AUTO_SPIN_OPTIONS[0]);
    setAutoSpinsRemaining(0);
    setStopOnBonus(true);
    setStopOnBigWin(25);
    setLastFeatureText(t("feature.defaultHint"));
    setBonusBanner(t("feature.bonusInactive"));
    setShowSettingsModal(false);
    setShowBuyBonusModal(false);
    setSoundEnabled(true);
    autoSpinQueuedRef.current = false;
    autoSpinStopRequestedRef.current = false;
    setSpinningColumns([]);
    setSettlingColumns([]);
    setSpinningStripColumns([]);
    setSpinningStripStyles([]);
    setStickySpecialOverlays([]);
    setActiveBonusState(null);
    setBonusEventState(null);
    setDisplayGrid(createPreviewGrid(nextProfileId));
    setStatusText(t("status.ready"));
    setRoundSummary(t("status.firstSpin"));
  }
  function openSettingsModal() {
    if (!spinning) {
      setShowSettingsModal(true);
    }
  }

  function openBuyBonusModal() {
    if (!spinning) {
      setShowBuyBonusModal(true);
    }
  }

  function cycleSpeed() {
    const currentIndex = SPEED_OPTIONS.findIndex((option) => option.id === speedId);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setSpeedId(SPEED_OPTIONS[nextIndex].id);
  }

  function toggleAutoPlay() {
    if (autoSpinsRemaining > 0) {
      autoSpinQueuedRef.current = false;
      autoSpinStopRequestedRef.current = true;
      setAutoSpinsRemaining(0);
      setStatusText(spinning ? t("status.stoppingAuto") : t("status.autoStopped"));
      setRoundSummary(spinning ? t("status.currentSpinWillFinish") : t("status.manualMode"));
      return;
    }

    if (spinning) {
      return;
    }

    if (balance < bet) {
      setStatusText(t("status.noFundsAuto"));
      return;
    }

    autoSpinStopRequestedRef.current = false;
    setAutoSpinsRemaining(autoSpinCount);
      setStatusText(t("status.autoStarted"));
      setRoundSummary(t("status.autoSeries", { count: autoSpinCount }));
  }

  useEffect(() => {
    if (autoSpinsRemaining <= 0 || spinning || autoSpinQueuedRef.current) {
      return;
    }

    if (balance < bet) {
      setAutoSpinsRemaining(0);
      setStatusText(t("status.autoStoppedNoFunds"));
      setRoundSummary(t("status.topUpOrLowerBet"));
      return;
    }

    autoSpinQueuedRef.current = true;
    const timer = window.setTimeout(() => {
      autoSpinQueuedRef.current = false;
      handleSpin();
    }, 220);

    return () => {
      window.clearTimeout(timer);
      autoSpinQueuedRef.current = false;
    };
  }, [autoSpinsRemaining, spinning, balance, bet]);

  function handleSpin() {
    if (spinning) {
      return;
    }

    if (balance < bet) {
      setStatusText(t("status.noFundsSpin"));
      return;
    }

    const nextSpinSpeedOption = speedOption;
    const plannedSpin = spinFromProfile(profileId, bet);

    setActiveSpinSpeedId(nextSpinSpeedOption.id);
    setSpinning(true);
    setBalance((value) => value - bet);
    setTotalBets((value) => value + bet);
    setLastWin(0);
    setWaysWins([]);
    setLastFeatureText(t("feature.baseSpinInProgress"));
    setBonusBanner(t("feature.bonusPending"));
    setSpinningColumns([0, 1, 2, 3, 4]);
    setSettlingColumns([]);
    setStickySpecialOverlays([]);
    setActiveBonusState(null);
    setBonusEventState(null);
    teasePlayedColumnsRef.current = new Set();
    setStatusText(t("status.reelsSpinning"));
    setRoundSummary(
      autoSpinsRemaining > 0
        ? t("status.autoRemainingWithSpeed", { count: autoSpinsRemaining, speed: nextSpinSpeedOption.label })
        : t("status.profileWithRtpAndSpeed", {
            profile: profile.label,
            rtp: formatRtpValue(profile.targetRtp),
            speed: nextSpinSpeedOption.label
          })
    );

    startSpinSequence(plannedSpin, nextSpinSpeedOption);
  }

  function handleBuyBonus(scatterCount, priceMultiplier) {
    if (spinning) {
      return;
    }

    const purchaseCost = bet * priceMultiplier;

    if (balance < purchaseCost) {
      setStatusText(t("status.noFundsBonusBuy"));
      return;
    }

    const nextSpinSpeedOption = speedOption;
    const plannedSpin = buyBonusFromProfile(profileId, bet, scatterCount);

    setShowBuyBonusModal(false);
    setActiveSpinSpeedId(nextSpinSpeedOption.id);
    setSpinning(true);
    setBalance((value) => value - purchaseCost);
    setTotalBets((value) => value + purchaseCost);
    setLastWin(0);
    setWaysWins([]);
    setLastFeatureText(t("feature.bonusPending"));
    setBonusBanner(t("feature.bonusPending"));
    setSpinningColumns([0, 1, 2, 3, 4]);
    setSettlingColumns([]);
    setStickySpecialOverlays([]);
    setActiveBonusState(null);
    teasePlayedColumnsRef.current = new Set();
    setStatusText(t("status.bonusBuyStarted", { scatterCount }));
    setRoundSummary(t("status.bonusBuySummary", {
      cost: formatNumber(purchaseCost),
      spins: plannedSpin.bonusAwardedSpins
    }));

    startSpinSequence(plannedSpin, nextSpinSpeedOption);
  }

  function startSpinSequence(plannedSpin, spinOption) {
    const rounds = [plannedSpin.baseRound, ...(plannedSpin.respinRounds ?? [])].filter(Boolean);
    const bonusRounds = plannedSpin.bonusGame?.rounds ?? [];

    const runBonusRound = (bonusRoundIndex) => {
      const round = bonusRounds[bonusRoundIndex];

      if (!round) {
        finalizeSpin(plannedSpin);
        return;
      }

      setWaysWins([]);
      setStickySpecialOverlays(
        (round.startingStickyPositions ?? []).map((position) => ({
          ...position,
          symbol: round.grid[position.column][position.row]
        }))
      );

      startSpinAnimation(round, spinOption, () => {
        const nextRoundNumber = bonusRoundIndex + 1;
        const totalBonusRounds = bonusRounds.length;
        const stickyWilds = round.stickyPositions?.filter((entry) => entry.symbolId === "wild").length ?? 0;
        const accumulatedBonusWin = bonusRounds
          .slice(0, nextRoundNumber)
          .reduce((sum, bonusRound) => sum + (bonusRound.totalWin ?? 0), 0);
        const hasBonusEvent = round.extraSpinsAwarded > 0 || round.bonusUpgraded;

        setActiveBonusState({
          scatterCount: round.bonusLevel ?? plannedSpin.bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
          totalSpins: totalBonusRounds,
          remainingSpins: totalBonusRounds - nextRoundNumber,
          stickyWilds,
          maxStickyWilds: round.maxStickyWilds ?? plannedSpin.bonusGame?.maxStickyWilds ?? stickyWilds,
          maxMultiplier: round.maxMultiplier ?? plannedSpin.bonusGame?.maxMultiplier ?? 1,
          totalWin: accumulatedBonusWin,
          spinWin: round.totalWin
        });
        setBonusEventState(
          hasBonusEvent
            ? {
                extraSpins: round.extraSpinsAwarded ?? 0,
                upgradedToLevel: round.bonusUpgraded ? round.nextBonusLevel : null
              }
            : null
        );

        if (hasBonusEvent) {
          const clearBonusEventTimer = window.setTimeout(() => {
            setBonusEventState(null);
          }, 1200);
          timersRef.current.push(clearBonusEventTimer);
        }

        setLastWin(round.totalWin);
        setLastFeatureText(t("feature.bonusRoundResult", {
          round: nextRoundNumber,
          total: totalBonusRounds,
          win: formatNumber(round.totalWin)
        }));
        setStatusText(t("status.bonusSpinFinished", { round: nextRoundNumber }));
        setRoundSummary(t("status.bonusSpinSummary", {
          stickyWilds,
          maxStickyWilds: plannedSpin.bonusGame?.maxStickyWilds ?? stickyWilds,
          win: formatNumber(round.totalWin)
        }));

        if (bonusRoundIndex < bonusRounds.length - 1) {
          const nextBonusTimer = window.setTimeout(() => runBonusRound(bonusRoundIndex + 1), 260);
          timersRef.current.push(nextBonusTimer);
          return;
        }

        finalizeSpin(plannedSpin);
      });
    };

    const runRound = (roundIndex) => {
      const round = rounds[roundIndex];
      setWaysWins([]);
      setStickySpecialOverlays(
        (round.startingStickyPositions ?? []).map((position) => ({
          ...position,
          symbol: round.grid[position.column][position.row]
        }))
      );
      startSpinAnimation(round, spinOption, () => {
        if (roundIndex < rounds.length - 1) {
          const nextRoundNumber = roundIndex + 1;
          setLastWin(round.totalWin);
          setLastFeatureText(t("feature.respinRoundResult", {
            round: nextRoundNumber,
            total: plannedSpin.respinCount,
            win: formatNumber(round.totalWin)
          }));
          setStatusText(t("status.respinFinished", { round: nextRoundNumber }));
          setRoundSummary(t("status.stickyRespinWin", { win: formatNumber(round.totalWin) }));
          const respinTimer = window.setTimeout(() => runRound(roundIndex + 1), 260);
          timersRef.current.push(respinTimer);
          return;
        }

        if (bonusRounds.length > 0) {
          setLastWin(0);
          setWaysWins([]);
          setBonusEventState(null);
          setActiveBonusState({
            scatterCount: plannedSpin.bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
            totalSpins: bonusRounds.length,
            remainingSpins: bonusRounds.length,
            stickyWilds: 0,
            maxStickyWilds: plannedSpin.bonusGame?.rounds?.[0]?.maxStickyWilds ?? plannedSpin.bonusGame?.maxStickyWilds ?? 0,
            maxMultiplier: plannedSpin.bonusGame?.rounds?.[0]?.maxMultiplier ?? plannedSpin.bonusGame?.maxMultiplier ?? 1,
            totalWin: 0,
            spinWin: 0
          });
          setStatusText(t("status.bonusStarted"));
          setRoundSummary(t("status.bonusIntro", {
            scatterCount: plannedSpin.bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
            spins: plannedSpin.bonusAwardedSpins
          }));
          const bonusTimer = window.setTimeout(() => runBonusRound(0), 260);
          timersRef.current.push(bonusTimer);
          return;
        }

        finalizeSpin(plannedSpin);
      });
    };

    if (rounds.length === 0 && bonusRounds.length > 0) {
      setLastWin(0);
      setWaysWins([]);
      setBonusEventState(null);
      setActiveBonusState({
        scatterCount: plannedSpin.bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
        totalSpins: bonusRounds.length,
        remainingSpins: bonusRounds.length,
        stickyWilds: 0,
        maxStickyWilds: plannedSpin.bonusGame?.rounds?.[0]?.maxStickyWilds ?? plannedSpin.bonusGame?.maxStickyWilds ?? 0,
        maxMultiplier: plannedSpin.bonusGame?.rounds?.[0]?.maxMultiplier ?? plannedSpin.bonusGame?.maxMultiplier ?? 1,
        totalWin: 0,
        spinWin: 0
      });
      setStatusText(t("status.bonusStarted"));
      setRoundSummary(t("status.bonusIntro", {
        scatterCount: plannedSpin.bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
        spins: plannedSpin.bonusAwardedSpins
      }));
      const bonusTimer = window.setTimeout(() => runBonusRound(0), 260);
      timersRef.current.push(bonusTimer);
      return;
    }

    runRound(0);
  }

  function startSpinAnimation(plannedSpin, spinOption, onComplete) {
    clearSpinTimers();
    setSpinningColumns(Array.from({ length: plannedSpin.grid.length }, (_, index) => index));
    setSettlingColumns([]);
    const nextStripColumns = [];
    const nextStripStyles = [];
    const animatedStripStyles = [];

    for (let column = 0; column < plannedSpin.grid.length; column += 1) {
      const columnSpinProfile = getColumnSpinProfile(column, spinOption);
      const totalDuration = columnSpinProfile.totalDuration;
      const fillerColumns = Array.from(
        { length: Math.max(6, Math.ceil(totalDuration / spinOption.stripStepMs)) },
        () => createPreviewGrid(profileId)[column]
      );
      const stripItems = createSpinningColumnItems(displayGridRef.current[column], plannedSpin.grid[column], fillerColumns);
      const offsetSteps = Math.max(0, stripItems.length - plannedSpin.grid[column].length);

      nextStripColumns[column] = stripItems;
      nextStripStyles[column] = {
        "--reel-stop-distance": `calc(-${offsetSteps} * (var(--symbol-height) + var(--reel-gap)))`,
        transform: "translate3d(0, 0, 0)",
        animation: "none"
      };
      animatedStripStyles[column] = {
        "--reel-stop-distance": `calc(-${offsetSteps} * (var(--symbol-height) + var(--reel-gap)))`,
        transform: "translate3d(0, var(--reel-stop-distance), 0)",
        animation: `reelSpinTrackAccelerated ${totalDuration}ms both`
      };

      const timer = window.setTimeout(() => {
        setDisplayGrid((current) => {
          const nextGrid = current.map((items) => [...items]);
          nextGrid[column] = plannedSpin.grid[column];
          displayGridRef.current = nextGrid;
          maybePlayScatterTease(nextGrid, column);
          return nextGrid;
        });
        setSpinningColumns((current) => current.filter((value) => value !== column));
        setSettlingColumns((current) => [...current.filter((value) => value !== column), column]);

        const settleTimer = window.setTimeout(() => {
          setSettlingColumns((current) => current.filter((value) => value !== column));
        }, 220);
        timersRef.current.push(settleTimer);

        if (column === plannedSpin.grid.length - 1) {
          onComplete();
        }
      }, totalDuration);

      timersRef.current.push(timer);
    }

    setSpinningStripColumns(nextStripColumns);
    setSpinningStripStyles(nextStripStyles);
    const animationKickTimer = window.setTimeout(() => {
      setSpinningStripStyles(animatedStripStyles);
    }, 20);
    timersRef.current.push(animationKickTimer);
  }

  function finalizeSpin(plannedSpin) {
    const hadAutoPlay = autoSpinsRemaining > 0;
    const nextAutoSpinsRemaining = hadAutoPlay ? autoSpinsRemaining - 1 : 0;
    const bonusGame = plannedSpin.bonusGame;
    const bonusInfo = plannedSpin.bonusTriggered
      ? t("status.scatterBonusInfo", {
          count: plannedSpin.scatterCount,
          spins: plannedSpin.bonusAwardedSpins,
          win: formatNumber(bonusGame?.totalWin ?? 0)
        })
      : plannedSpin.scatterCount >= 3
        ? t("status.scatterPayoutInfo", {
            count: plannedSpin.scatterCount,
            win: formatNumber(plannedSpin.scatterWin)
          })
        : t("feature.bonusInactive");
    const bonusBannerText = plannedSpin.bonusTriggered
      ? t("status.bonusBanner", {
          scatterCount: bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
          spins: plannedSpin.bonusAwardedSpins,
          stickyWilds: bonusGame?.finalStickyWildCount ?? 0,
          maxStickyWilds: bonusGame?.maxStickyWilds ?? 0,
          maxMultiplier: bonusGame?.maxMultiplier ?? 1,
          win: formatNumber(bonusGame?.totalWin ?? 0)
        })
      : t("feature.bonusInactive");
    const hitBigWin = stopOnBigWin > 0 && plannedSpin.totalWin >= bet * stopOnBigWin;
    const manualStopRequested = autoSpinStopRequestedRef.current;
    const stopAutoNow = hadAutoPlay && (
      manualStopRequested ||
      (stopOnBonus && plannedSpin.bonusTriggered) ||
      hitBigWin ||
      nextAutoSpinsRemaining === 0
    );
    const finalAutoSpinsRemaining = stopAutoNow ? 0 : nextAutoSpinsRemaining;

    setLastWin(plannedSpin.totalWin);
    setBalance((value) => value + plannedSpin.totalWin);
    setTotalWins((value) => value + plannedSpin.totalWin);
    setWaysWins(plannedSpin.waysWins);
    setLastFeatureText(
      plannedSpin.bonusTriggered
        ? t("feature.bonusFeatureSummary", {
            scatterCount: bonusGame?.triggerScatterCount ?? plannedSpin.scatterCount,
            spins: plannedSpin.bonusAwardedSpins,
            stickyWilds: bonusGame?.finalStickyWildCount ?? 0,
            maxStickyWilds: bonusGame?.maxStickyWilds ?? 0,
            maxMultiplier: bonusGame?.maxMultiplier ?? 1
          })
        : getFeatureSummary(plannedSpin, bonusInfo)
    );
    setBonusBanner(bonusBannerText);
    setStickySpecialOverlays([]);
    setSpinning(false);
    setSpinningStripColumns([]);
    setSpinningStripStyles([]);
    setActiveBonusState(null);
    setBonusEventState(null);
    setAutoSpinsRemaining(finalAutoSpinsRemaining);
    autoSpinStopRequestedRef.current = false;

    if (plannedSpin.totalWin > 0) {
      if (manualStopRequested) {
        setStatusText(t("status.autoStopped"));
        setRoundSummary(t("status.autoStoppedWin", { win: formatNumber(plannedSpin.totalWin) }));
        return;
      }

      if (hadAutoPlay && stopOnBonus && plannedSpin.bonusTriggered) {
        setStatusText(t("status.autoStoppedByBonus"));
        setRoundSummary(t("status.autoReachedBonus", { spins: plannedSpin.bonusAwardedSpins }));
        return;
      }

      if (hadAutoPlay && hitBigWin) {
        setStatusText(t("status.autoStoppedByBigWin"));
        setRoundSummary(t("status.bigWinThreshold", {
          win: formatNumber(plannedSpin.totalWin),
          threshold: stopOnBigWin
        }));
        return;
      }

      setStatusText(plannedSpin.bonusTriggered ? t("status.bonusCompleted") : t("status.winValue", { win: plannedSpin.totalWin }));
      setRoundSummary(
        plannedSpin.bonusTriggered
          ? t("status.bonusTotalWin", {
              win: formatNumber(plannedSpin.bonusGame?.totalWin ?? 0),
              spinWin: formatNumber(plannedSpin.finalDisplayRound?.totalWin ?? 0)
            })
          : hadAutoPlay && finalAutoSpinsRemaining > 0
            ? t("status.waysAndAutospins", { ways: plannedSpin.totalWays, count: finalAutoSpinsRemaining })
            : t("status.waysAndCombos", { ways: plannedSpin.totalWays, count: plannedSpin.waysWins.length })
      );
      return;
    }

    if (manualStopRequested) {
      setStatusText(t("status.autoStopped"));
      setRoundSummary(t("status.autoStoppedNoWin"));
      return;
    }

    if (hadAutoPlay && finalAutoSpinsRemaining > 0) {
      setStatusText(t("status.autoContinues"));
      setRoundSummary(t("status.noWinAutospinsLeft", { count: finalAutoSpinsRemaining }));
      return;
    }

    if (hadAutoPlay && finalAutoSpinsRemaining === 0) {
      setStatusText(t("status.autoCompleted"));
      setRoundSummary(t("status.use243Ways"));
      return;
    }

    setStatusText(t("status.noWin"));
    setRoundSummary(t("status.use243Ways"));
  }

  const winningCells = new Set();
  waysWins.forEach((entry) => {
    entry.positions.forEach((position) => {
      winningCells.add(`${position.column}-${position.row}`);
    });
  });

  const winSummaryText = waysWins.length === 0
    ? (spinning ? t("status.hiddenCombos") : t("status.noActiveCombos"))
    : waysWins
        .map((entry) => t("status.waysLine", {
          symbol: entry.symbol.name,
          countLabel: entry.countLabel,
          reels: entry.reels,
          ways: entry.ways,
          payout: entry.payout
        }))
        .join("\n");

  return (
    <main className="app-shell">
      <div
        className="app-viewport"
        style={{
          width: `${BASE_STAGE_WIDTH}px`,
          height: `${BASE_STAGE_HEIGHT}px`,
          transform: `translate(-50%, -50%) scale(${viewportScale})`
        }}
      >
      <section className="slot-stage">
        <header className="stage-header">
          <div>
            <p className="eyebrow">Prototype / Reel Strips</p>
            <h1>{t("ui.title")}</h1>
          </div>
        </header>

        <div className="top-crest" aria-hidden="true" />

        <section className="machine-frame" aria-label={t("ui.machineAria")} style={spinVisualStyle}>
            {activeBonusState ? (
              <div className="bonus-badge" role="status" aria-live="polite">
                <strong>{t("ui.bonusBadgeTitle", { scatterCount: activeBonusState.scatterCount })}</strong>
                {bonusEventState ? (
                  <div className="bonus-event-banner">
                    {bonusEventState.upgradedToLevel ? (
                      <span>{t("status.bonusUpgradeEvent", { level: bonusEventState.upgradedToLevel })}</span>
                    ) : null}
                    {bonusEventState.extraSpins > 0 ? (
                      <span>{t("status.bonusExtraSpinsEvent", { spins: bonusEventState.extraSpins })}</span>
                    ) : null}
                  </div>
                ) : null}
                <span>{t("ui.bonusBadgeSpins", {
                  remaining: activeBonusState.remainingSpins,
                  total: activeBonusState.totalSpins
                })}</span>
                <span>{t("ui.bonusBadgeWilds", {
                  count: activeBonusState.stickyWilds,
                  max: activeBonusState.maxStickyWilds,
                  multiplier: activeBonusState.maxMultiplier
                })}</span>
                <span>{t("ui.bonusBadgeTotalWin", {
                  win: formatNumber(activeBonusState.totalWin ?? 0)
                })}</span>
                <span>{t("ui.bonusBadgeSpinWin", {
                  win: formatNumber(activeBonusState.spinWin ?? 0)
                })}</span>
              </div>
            ) : null}
            <div className="reel-grid-backdrop" aria-hidden="true" />
            <div className="reel-grid">
              {displayGrid.map((column, columnIndex) => (
                <div
                  className={`reel-column${spinningColumns.includes(columnIndex) ? " is-spinning" : ""}${settlingColumns.includes(columnIndex) ? " is-settling" : ""}`}
                  key={`column-${columnIndex}`}
                >
                  {stickySpecialOverlays
                    .filter((entry) => entry.column === columnIndex)
                    .map((entry) => (
                      <article
                        className={`symbol-cell sticky-special-cell${entry.symbol.id === "scatter" ? " sticky-scatter-cell" : ""}`}
                        key={`sticky-${entry.column}-${entry.row}`}
                        style={{ top: `calc(${entry.row} * (var(--symbol-height) + var(--reel-gap)))` }}
                      >
                        <div className="symbol-face">
                          <div className="symbol-icon">{entry.symbol.icon ? <img className="symbol-image" src={entry.symbol.icon} alt={entry.symbol.name} /> : null}</div>
                        </div>
                      </article>
                    ))}
                  <div
                    className={`reel-strip${spinningColumns.includes(columnIndex) ? " is-spinning" : ""}${settlingColumns.includes(columnIndex) ? " is-settling" : ""}`}
                    style={
                      spinningColumns.includes(columnIndex)
                        ? spinningStripStyles[columnIndex]
                        : settlingColumns.includes(columnIndex)
                          ? { ...spinningStripStyles[columnIndex], transform: "translate3d(0, var(--reel-stop-distance), 0)" }
                          : undefined
                    }
                  >
                    {((spinningColumns.includes(columnIndex) || settlingColumns.includes(columnIndex)) && spinningStripColumns[columnIndex]
                      ? spinningStripColumns[columnIndex]
                      : column.map((symbol, rowIndex) => ({ symbol, rowIndex, repeatIndex: 0 }))
                    ).map(({ symbol, rowIndex, repeatIndex }) => {
                    const cellKey = `${columnIndex}-${rowIndex}`;
                    const isSpinning = spinningColumns.includes(columnIndex);
                    const isWinning = !isSpinning && winningCells.has(cellKey);

                    return (
                      <article
                        className={`symbol-cell${isWinning ? " is-winning" : ""}`}
                        key={`${cellKey}-${repeatIndex}`}
                      >
                        <div className="symbol-face">
                          <div className="symbol-icon">{symbol.icon ? <img className="symbol-image" src={symbol.icon} alt={symbol.name} /> : null}</div>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                </div>
              ))}
            </div>
        </section>

        <section className="under-reels-bar">
          <article className="top-stat top-stat-win">
            <span>{t("ui.lastWin")}</span>
            <strong>{formatNumber(lastWin)}</strong>
          </article>
        </section>

        <section className="control-bar">
          <AssetButton
            shellClassName="side-button"
            artClassName="side-button-art"
            label={t("ui.settings")}
            onClick={openSettingsModal}
          />

          <AssetButton
            shellClassName={`sound-button${soundEnabled ? " is-on" : " is-off"}`}
            artClassName="sound-button-art"
            label={soundEnabled ? "Sound on" : "Sound off"}
            ariaLabel={soundEnabled ? "Sound on" : "Sound off"}
            onClick={toggleSound}
          />

          <AssetButton
            shellClassName="bonus-buy-button"
            artClassName="bonus-buy-button-art"
            label={t("ui.buyBonus")}
            onClick={openBuyBonusModal}
          >
            <span className="bonus-buy-button-label">{t("ui.buyBonus")}</span>
          </AssetButton>

          <div className="center-controls">
            <div className="round-meta">
              <span>{statusText}</span>
              <span>{roundSummary}</span>
            </div>
          </div>

          <div className="spin-counter" aria-live="polite">
            {autoSpinsRemaining > 0 ? autoSpinsRemaining : autoSpinCount}
          </div>

          <div className="bet-display" aria-live="polite">
            <span>{t("ui.betAria")}</span>
            <strong>{formatNumber(bet)}</strong>
          </div>

          <div className="balance-display" aria-live="polite">
            <span>{t("ui.balance")}</span>
            <strong>{formatNumber(balance)}</strong>
          </div>

          <button
            className="round-button utility-button"
            type="button"
            onClick={cycleSpeed}
          >
            {speedOption.label}
          </button>

          <AssetButton
            shellClassName={`auto-button${autoSpinsRemaining > 0 ? " is-active" : ""}`}
            artClassName="auto-button-art"
            label={autoSpinsRemaining > 0 ? t("ui.autoStop", { count: autoSpinsRemaining }) : t("ui.auto")}
            onClick={toggleAutoPlay}
          />

          <AssetButton
            shellClassName="bet-modifier bet-modifier-decrease"
            artClassName="bet-modifier-art"
            label="Decrease bet"
            disabled={spinning || currentBetIndex === 0}
            onClick={() => setCurrentBetIndex((value) => value - 1)}
          />

          <AssetButton
            shellClassName="bet-modifier bet-modifier-increase"
            artClassName="bet-modifier-art"
            label="Increase bet"
            disabled={spinning || currentBetIndex === BET_OPTIONS.length - 1}
            onClick={() => setCurrentBetIndex((value) => value + 1)}
          />

          <AssetButton
            shellClassName="spin-button"
            artClassName="spin-button-art"
            label={t("ui.spin")}
            disabled={spinning || balance < bet}
            onClick={handleSpin}
          />
        </section>
      </section>

      <footer className="footer-panel sr-only-panel">
        <section className="footer-section">
          <h2>{t("ui.mechanicsTitle")}</h2>
          <div className="footer-grid">
            <article className="footer-card">
              <span className="card-label">{t("ui.sessionRtp")}</span>
              <strong>{sessionRtp.toFixed(2)}%</strong>
              <p>{t("ui.betsAndWins", { bets: formatNumber(totalBets), wins: formatNumber(totalWins) })}</p>
            </article>
            <article className="footer-card footer-card-wide">
              <span className="card-label">{t("ui.lastSpin")}</span>
              <strong>{totalWays} ways</strong>
              <p>{`${winSummaryText}\n${lastFeatureText}`}</p>
            </article>
          </div>
        </section>

      </footer>

      {showSettingsModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowSettingsModal(false)}>
          <section
            aria-label={t("ui.rulesAria")}
            className="settings-modal rules-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-header">
              <div>
                <p className="eyebrow">Rules / Settings</p>
                <h2>{t("ui.rulesTitle")}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setShowSettingsModal(false)}>
                {t("ui.close")}
              </button>
            </div>

            <div className="modal-grid">
              <article className="setting-card">
                <span className="card-label">{t("ui.payMode")}</span>
                <strong>243 ways</strong>
                <p>{t("ui.waysDescriptionExtended")}</p>
              </article>

              <article className="setting-card">
                <span className="card-label">{t("ui.bonusRulesTitle")}</span>
                <strong>3 / 4 / 5 Scatter</strong>
                <div className="formatted-rule-text">{renderFormattedRuleText(t("ui.bonusRulesExtended"))}</div>
              </article>

              <label className="setting-card" htmlFor="modalProfileSelect">
                <span className="card-label">{t("ui.profileSelect")}</span>
                <strong>{profile.label}</strong>
                <select
                  id="modalProfileSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={profileId}
                  onChange={(event) => resetSession(event.target.value)}
                >
                  {Object.values(SLOT_PROFILES).map((option) => (
                    <option key={option.id} value={option.id}>
                      {t("ui.profileOption", { label: option.label, rtp: option.targetRtp })}
                    </option>
                  ))}
                </select>
                <p>{t("ui.profileResetHint")}</p>
              </label>
              <article className="setting-card">
                <span className="card-label">{t("ui.targetRtp")}</span>
                <strong>{formatRtpValue(profile.targetRtp)}%</strong>
                <p>{t("ui.targetRtpTheoryHint")}</p>
              </article>

              <label className="setting-card" htmlFor="modalAutoSpinSelect">
                <span className="card-label">{t("ui.autoplay")}</span>
                <strong>{t("ui.spinsCount", { count: autoSpinCount })}</strong>
                <select
                  id="modalAutoSpinSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={autoSpinCount}
                  onChange={(event) => setAutoSpinCount(Number(event.target.value))}
                >
                  {AUTO_SPIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t("ui.autospinsCount", { count: option })}
                    </option>
                  ))}
                </select>
                <p>{t("ui.autoplayModalHint")}</p>
              </label>

              <label className="setting-card" htmlFor="modalStopOnBonusSelect">
                <span className="card-label">{t("ui.stopConditions")}</span>
                <strong>{stopOnBonus ? t("ui.stopOnBonus") : t("ui.stopOnlyByThreshold")}</strong>
                <select
                  id="modalStopOnBonusSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={stopOnBonus ? "on" : "off"}
                  onChange={(event) => setStopOnBonus(event.target.value === "on")}
                >
                  <option value="on">{t("ui.stopAtBonus")}</option>
                  <option value="off">{t("ui.dontStopAtBonus")}</option>
                </select>
                <select
                  className="profile-select"
                  disabled={spinning}
                  value={stopOnBigWin}
                  onChange={(event) => setStopOnBigWin(Number(event.target.value))}
                >
                  {BIG_WIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? t("ui.noBigWinStop") : t("ui.stopAtStakeX", { count: option })}
                    </option>
                  ))}
                </select>
                <p>{t("ui.stopConditionsModalHint")}</p>
              </label>

              <article className="setting-card">
                <span className="card-label">{t("ui.paytable")}</span>
                <div className="paytable">
                  {paytableRows.map((row) => (
                    <div className="paytable-row" key={`modal-${row.symbol.id}`}>
                      <span className="paytable-symbol">{row.symbol.icon ? <img className="paytable-symbol-image" src={row.symbol.icon} alt={row.symbol.name} /> : null}{row.symbol.name}</span>
                      <span>x3 {row.payoutLabels[3]}</span>
                      <span>x4 {row.payoutLabels[4]}</span>
                      <span>x5 {row.payoutLabels[5]}</span>
                    </div>
                  ))}
                </div>
              </article>

              <label className="setting-card" htmlFor="modalSpeedSelect">
                <span className="card-label">{t("ui.gameSpeed")}</span>
                <strong>{speedOption.label}</strong>
                <select
                  id="modalSpeedSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={speedId}
                  onChange={(event) => setSpeedId(event.target.value)}
                >
                  {SPEED_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p>{t("ui.speedModalHint")}</p>
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {showBuyBonusModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowBuyBonusModal(false)}>
          <section
            aria-label={t("ui.buyBonusTitle")}
            className="settings-modal bonus-buy-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-header">
              <div>
                <p className="eyebrow">Bonus Buy</p>
                <h2>{t("ui.buyBonusTitle")}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setShowBuyBonusModal(false)}>
                {t("ui.close")}
              </button>
            </div>

            <div className="modal-grid">
              <article className="setting-card">
                <span className="card-label">{t("ui.buyBonusTitle")}</span>
                <strong>{formatNumber(bet)}</strong>
                <p>{t("ui.buyBonusHint")}</p>
                <p>{t("ui.buyBonusRules")}</p>
              </article>

              {BONUS_BUY_OPTIONS.map((option) => {
                const price = bet * option.priceMultiplier;

                return (
                  <article className="setting-card" key={`bonus-buy-${option.scatterCount}`}>
                    <span className="card-label">{t("ui.buyBonusOption", { scatterCount: option.scatterCount })}</span>
                    <strong>{formatNumber(price)}</strong>
                    <p>{t("ui.buyBonusPrice", { multiplier: option.priceMultiplier })}</p>
                    <button
                      className="buy-bonus-option-button"
                      type="button"
                      disabled={spinning || balance < price}
                      onClick={() => handleBuyBonus(option.scatterCount, option.priceMultiplier)}
                    >
                      {t("ui.buyBonus")}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
      </div>
    </main>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="slot-stage">
            <header className="stage-header">
              <div>
                <p className="eyebrow">Runtime error</p>
                <h1>{t("ui.runtimeTitle")}</h1>
              </div>
            </header>
            <section className="machine-frame">
              <p>{t("ui.reactError", { message: this.state.message })}</p>
            </section>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SlotApp />
    </ErrorBoundary>
  );
}







