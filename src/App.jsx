import React, { Component, useEffect, useRef, useState } from "react";
import {
  BET_OPTIONS,
  DEFAULT_BALANCE,
  DEFAULT_PROFILE_ID,
  SLOT_PROFILES
} from "./math/slotConfig.js";
import {
  createPreviewGrid,
  getPaytableRows,
  getProfile,
  spinFromProfile
} from "./math/engine.js";

const SPEED_OPTIONS = [
  { id: "standard", label: "⏱", spinBase: 2200, spinStep: 720, previewStep: 44, settleStep: 132, stripStepMs: 1120 },
  { id: "fast", label: "⚡", spinBase: 700, spinStep: 220, previewStep: 30, settleStep: 88, stripStepMs: 280 },
  { id: "hyper", label: "🚀", spinBase: 180, spinStep: 68, previewStep: 16, settleStep: 40, stripStepMs: 280 }
];

const AUTO_SPIN_OPTIONS = [10, 25, 50, 100];
const BIG_WIN_OPTIONS = [0, 10, 25, 50, 100];

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
  const [lastFeatureText, setLastFeatureText] = useState("3+ scatter запускают bonus free spins.");
  const [bonusBanner, setBonusBanner] = useState("Bonus не активирован.");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [spinningColumns, setSpinningColumns] = useState([]);
  const [settlingColumns, setSettlingColumns] = useState([]);
  const [spinningStripColumns, setSpinningStripColumns] = useState([]);
  const [spinningStripStyles, setSpinningStripStyles] = useState([]);
  const [statusText, setStatusText] = useState("Готово к игре");
  const [roundSummary, setRoundSummary] = useState("Сделайте первый спин");
  const timersRef = useRef([]);
  const intervalsRef = useRef([]);
  const autoSpinQueuedRef = useRef(false);
  const autoSpinStopRequestedRef = useRef(false);
  const audioContextRef = useRef(null);
  const teasePlayedColumnsRef = useRef(new Set());

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
    return () => {
      clearSpinTimers();
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

    if (!AudioContextCtor) {
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
    setLastFeatureText("3+ scatter запускают bonus free spins.");
    setBonusBanner("Bonus не активирован.");
    setShowSettingsModal(false);
    autoSpinQueuedRef.current = false;
    autoSpinStopRequestedRef.current = false;
    setSpinningColumns([]);
    setSettlingColumns([]);
    setSpinningStripColumns([]);
    setSpinningStripStyles([]);
    setDisplayGrid(createPreviewGrid(nextProfileId));
    setStatusText("Готово к игре");
    setRoundSummary("Сделайте первый спин");
  }
  function openSettingsModal() {
    if (!spinning) {
      setShowSettingsModal(true);
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
      setStatusText(spinning ? "Остановка автоигры..." : "Автоигра остановлена");
      setRoundSummary(spinning ? "Текущий спин будет доигран" : "Ручной режим");
      return;
    }

    if (spinning) {
      return;
    }

    if (balance < bet) {
      setStatusText("Недостаточно средств для автоигры");
      return;
    }

    autoSpinStopRequestedRef.current = false;
    setAutoSpinsRemaining(autoSpinCount);
    setStatusText("Автоигра запущена");
    setRoundSummary(`Серия на ${autoSpinCount} спинов`);
  }

  useEffect(() => {
    if (autoSpinsRemaining <= 0 || spinning || autoSpinQueuedRef.current) {
      return;
    }

    if (balance < bet) {
      setAutoSpinsRemaining(0);
      setStatusText("Автоигра остановлена: недостаточно средств");
      setRoundSummary("Пополните баланс или уменьшите ставку");
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
      setStatusText("Недостаточно средств для спина");
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
    setLastFeatureText("Базовый спин в процессе.");
    setBonusBanner("Ожидание bonus-результата.");
    setSpinningColumns([0, 1, 2, 3, 4]);
    setSettlingColumns([]);
    teasePlayedColumnsRef.current = new Set();
    setStatusText("Барабаны вращаются...");
    setRoundSummary(
      autoSpinsRemaining > 0
        ? `Автоигра: осталось ${autoSpinsRemaining} • ${nextSpinSpeedOption.label}`
        : `${profile.label} • RTP ${formatRtpValue(profile.targetRtp)}% • ${nextSpinSpeedOption.label}`
    );

    startSpinAnimation(plannedSpin, nextSpinSpeedOption);
  }

  function startSpinAnimation(plannedSpin, spinOption) {
    clearSpinTimers();
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
      const stripItems = createSpinningColumnItems(displayGrid[column], plannedSpin.grid[column], fillerColumns);
      const offsetSteps = Math.max(0, stripItems.length - plannedSpin.grid[column].length);

      nextStripColumns[column] = stripItems;
      nextStripStyles[column] = {
        "--reel-stop-distance": `calc(-${offsetSteps} * (var(--symbol-height) + var(--reel-gap)))`,
        transform: "translate3d(0, 0, 0)",
        transition: "none"
      };
      animatedStripStyles[column] = {
        "--reel-stop-distance": `calc(-${offsetSteps} * (var(--symbol-height) + var(--reel-gap)))`,
        transform: "translate3d(0, var(--reel-stop-distance), 0)",
        transition: `transform ${totalDuration}ms linear`
      };

      const timer = window.setTimeout(() => {
        setDisplayGrid((current) => {
          const nextGrid = current.map((items) => [...items]);
          nextGrid[column] = plannedSpin.grid[column];
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
          finalizeSpin(plannedSpin);
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
    const bonusInfo = plannedSpin.bonusTriggered
      ? `Scatter ${plannedSpin.scatterCount}: bonus на ${plannedSpin.bonusAwardedSpins} spins, bonus win ${formatNumber(plannedSpin.bonusGame?.totalWin ?? 0)}`
      : plannedSpin.scatterCount >= 3
        ? `Scatter ${plannedSpin.scatterCount}: выплата ${formatNumber(plannedSpin.scatterWin)}`
        : "Bonus не активирован.";
    const bonusBannerText = plannedSpin.bonusTriggered
      ? `Free spins: ${plannedSpin.bonusAwardedSpins}, retrigger: ${plannedSpin.bonusGame?.retriggers ?? 0}, bonus win: ${formatNumber(plannedSpin.bonusGame?.totalWin ?? 0)}`
      : "Bonus не активирован.";
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
    setLastFeatureText(bonusInfo);
    setBonusBanner(bonusBannerText);
    setSpinning(false);
    setSpinningStripColumns([]);
    setSpinningStripStyles([]);
    setAutoSpinsRemaining(finalAutoSpinsRemaining);
    autoSpinStopRequestedRef.current = false;

    if (plannedSpin.totalWin > 0) {
      if (manualStopRequested) {
        setStatusText("Автоигра остановлена");
        setRoundSummary(`Серия остановлена вручную • выигрыш ${formatNumber(plannedSpin.totalWin)}`);
        return;
      }

      if (hadAutoPlay && stopOnBonus && plannedSpin.bonusTriggered) {
        setStatusText("Автоигра остановлена по bonus");
        setRoundSummary(`Bonus trigger • free spins ${plannedSpin.bonusAwardedSpins}`);
        return;
      }

      if (hadAutoPlay && hitBigWin) {
        setStatusText("Автоигра остановлена по big win");
        setRoundSummary(`Выигрыш ${formatNumber(plannedSpin.totalWin)} >= ${stopOnBigWin}x ставки`);
        return;
      }

      setStatusText(`Выигрыш ${plannedSpin.totalWin}`);
      setRoundSummary(
        hadAutoPlay && finalAutoSpinsRemaining > 0
          ? `${plannedSpin.totalWays} ways • осталось ${finalAutoSpinsRemaining} автоспинов`
          : `${plannedSpin.totalWays} ways • ${plannedSpin.waysWins.length} комбинаций`
      );
      return;
    }

    if (manualStopRequested) {
      setStatusText("Автоигра остановлена");
      setRoundSummary("Серия остановлена вручную");
      return;
    }

    if (hadAutoPlay && finalAutoSpinsRemaining > 0) {
      setStatusText("Автоигра продолжается");
      setRoundSummary(`Без выигрыша • осталось ${finalAutoSpinsRemaining} автоспинов`);
      return;
    }

    if (hadAutoPlay && finalAutoSpinsRemaining === 0) {
      setStatusText("Автоигра завершена");
      setRoundSummary("Комбинации 243 ways не сработали");
      return;
    }

    setStatusText("Без выигрыша");
    setRoundSummary("Комбинации 243 ways не сработали");
  }

  const winningCells = new Set();
  waysWins.forEach((entry) => {
    entry.positions.forEach((position) => {
      winningCells.add(`${position.column}-${position.row}`);
    });
  });

  const winSummaryText = waysWins.length === 0
    ? (spinning ? "Идет анимация вращения барабанов." : "Пока нет выигрышных комбинаций.")
    : waysWins
        .map((entry) => `${entry.symbol.name}: ${entry.countLabel} на ${entry.reels} барабанах = ${entry.ways} ways, выплата ${entry.payout}`)
        .join(" • ");

  return (
    <main className="app-shell">
      <section className="slot-stage">
        <header className="stage-header">
          <div>
            <p className="eyebrow">Prototype / Reel Strips</p>
            <h1>Игровое поле</h1>
          </div>
        </header>

        <section className="machine-frame" aria-label="Игровое поле слота" style={spinVisualStyle}>
            <div className="reel-grid">
              {displayGrid.map((column, columnIndex) => (
                <div
                  className={`reel-column${spinningColumns.includes(columnIndex) ? " is-spinning" : ""}${settlingColumns.includes(columnIndex) ? " is-settling" : ""}`}
                  key={`column-${columnIndex}`}
                >
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
                          <div className="symbol-icon">{symbol.icon}</div>
                          <div className="symbol-name">{symbol.name}</div>
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
          <article className="top-stat">
            <span>Баланс</span>
            <strong>{formatNumber(balance)}</strong>
          </article>
          <article className="top-stat">
            <span>Текущий выигрыш</span>
            <strong>{formatNumber(lastWin)}</strong>
          </article>
          <article className="top-stat bonus-stat">
            <span>Bonus / Free Spins</span>
            <strong>{bonusBanner}</strong>
          </article>
        </section>

        <section className="control-bar">
          <button className="round-button side-button" type="button" onClick={openSettingsModal}>
            Правила
          </button>

          <div className="center-controls">
            <div className="bet-strip">
              <button
                className="bet-modifier"
                type="button"
                disabled={spinning || currentBetIndex === 0}
                onClick={() => setCurrentBetIndex((value) => value - 1)}
              >
                -
              </button>
              <div className="bet-options" aria-label="Ставка">
                {BET_OPTIONS.map((option, index) => (
                  <button
                    className={`bet-option${index === currentBetIndex ? " is-active" : ""}`}
                    type="button"
                    disabled={spinning}
                    key={option}
                    onClick={() => setCurrentBetIndex(index)}
                  >
                    {formatCompactNumber(option)}
                  </button>
                ))}
              </div>
              <button
                className="bet-modifier"
                type="button"
                disabled={spinning || currentBetIndex === BET_OPTIONS.length - 1}
                onClick={() => setCurrentBetIndex((value) => value + 1)}
              >
                +
              </button>
            </div>

            <div className="round-meta">
              <span>{statusText}</span>
              <span>{roundSummary}</span>
            </div>
          </div>

          <button
            className="round-button utility-button"
            type="button"
            onClick={cycleSpeed}
          >
            {speedOption.label}
          </button>

          <button
            className={`round-button auto-button${autoSpinsRemaining > 0 ? " is-active" : ""}`}
            type="button"
            onClick={toggleAutoPlay}
          >
            {autoSpinsRemaining > 0 ? `Стоп\n${autoSpinsRemaining}` : "Авто"}
          </button>

          <button
            className="round-button spin-button"
            type="button"
            disabled={spinning || balance < bet}
            onClick={handleSpin}
          >
            Спин
          </button>
        </section>
      </section>

      <footer className="footer-panel">
        <section className="footer-section">
          <h2>Правила и состояние</h2>
          <div className="footer-grid">
            <article className="footer-card">
              <span className="card-label">Правила</span>
              <strong>243 ways</strong>
              <p>Выигрыши считаются слева направо. 3+ scatter в любой позиции платят сразу и запускают bonus free spins.</p>
            </article>
            <article className="footer-card">
              <span className="card-label">Математический профиль</span>
              <strong>{profile.label}</strong>
              <p>{profile.description} RTP: {formatRtpValue(profile.targetRtp)}%</p>
            </article>
            <article className="footer-card">
              <span className="card-label">Сессия RTP</span>
              <strong>{sessionRtp.toFixed(2)}%</strong>
              <p>Ставки: {formatNumber(totalBets)} • Выплаты: {formatNumber(totalWins)}</p>
            </article>
            <article className="footer-card">
              <span className="card-label">Последний раунд</span>
              <strong>{totalWays} ways</strong>
              <p>{winSummaryText} {lastFeatureText}</p>
            </article>
          </div>
        </section>

        <section className="footer-section">
          <div className="settings-header">
            <h2>Техническая информация / настройки</h2>
            <span className="muted-text">Reel strips + paytable профили</span>
          </div>

          <div className="settings-grid">
            <label className="setting-card" htmlFor="profileSelect">
              <span className="card-label">Профиль математики</span>
              <strong>{profile.volatility}</strong>
              <select
                id="profileSelect"
                className="profile-select"
                disabled={spinning}
                value={profileId}
                onChange={(event) => resetSession(event.target.value)}
              >
                {Object.values(SLOT_PROFILES).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} • RTP {option.targetRtp}%
                  </option>
                ))}
              </select>
              <p>Профиль меняет reel strips и таблицу выплат. При смене профиль сессия сбрасывается.</p>
            </label>
            <article className="setting-card">
              <span className="card-label">Текущий RTP</span>
              <strong>{formatRtpValue(profile.targetRtp)}%</strong>
              <p>Слот сейчас работает с RTP активного математического профиля.</p>
            </article>


            <label className="setting-card" htmlFor="autoSpinSelect">
              <span className="card-label">Автоигра</span>
              <strong>{autoSpinCount} спинов</strong>
              <select
                id="autoSpinSelect"
                className="profile-select"
                disabled={spinning}
                value={autoSpinCount}
                onChange={(event) => setAutoSpinCount(Number(event.target.value))}
              >
                {AUTO_SPIN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} автоспинов
                  </option>
                ))}
              </select>
              <p>Пока это настройка прототипа. Следующим шагом ее можно связать с реальным циклом autoplay.</p>
            </label>

            <label className="setting-card" htmlFor="stopOnBonusSelect">
              <span className="card-label">Stop conditions</span>
              <strong>{stopOnBonus ? "Стоп по bonus" : "Без стопа по bonus"}</strong>
              <select
                id="stopOnBonusSelect"
                className="profile-select"
                disabled={spinning}
                value={stopOnBonus ? "on" : "off"}
                onChange={(event) => setStopOnBonus(event.target.value === "on")}
              >
                <option value="on">Стоп при bonus trigger</option>
                <option value="off">Не останавливать по bonus</option>
              </select>
              <select
                className="profile-select"
                disabled={spinning}
                value={stopOnBigWin}
                onChange={(event) => setStopOnBigWin(Number(event.target.value))}
              >
                {BIG_WIN_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 0 ? "Без стопа по big win" : `Стоп при ${option}x ставки`}
                  </option>
                ))}
              </select>
              <p>Автоигра может остановиться при bonus trigger или если один спин дал выигрыш выше заданного множителя ставки.</p>
            </label>

            <label className="setting-card" htmlFor="speedSelect">
              <span className="card-label">Скорость игры</span>
              <strong>{speedOption.label}</strong>
              <select
                id="speedSelect"
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
              <p>Эта настройка меняет длительность анимации вращения и скорость остановки барабанов.</p>
            </label>

            <article className="setting-card">
              <span className="card-label">Таблица выплат</span>
              <div className="paytable">
                {paytableRows.map((row) => (
                  <div className="paytable-row" key={row.symbol.id}>
                    <span>{row.symbol.icon} {row.symbol.name}</span>
                    <span>x3 {row.payoutLabels[3]}</span>
                    <span>x4 {row.payoutLabels[4]}</span>
                    <span>x5 {row.payoutLabels[5]}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </footer>

      {showSettingsModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowSettingsModal(false)}>
          <section
            aria-label="Правила и настройки"
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings-header">
              <div>
                <p className="eyebrow">Rules / Settings</p>
                <h2>Правила и настройки</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setShowSettingsModal(false)}>
                Закрыть
              </button>
            </div>

            <div className="modal-grid">
              <article className="setting-card">
                <span className="card-label">Правила игры</span>
                <strong>243 ways</strong>
                <p>Комбинации считаются слева направо. 3, 4 или 5 scatter в любой позиции платят сразу и запускают bonus free spins с повышенным множителем выигрыша.</p>
              </article>

              <label className="setting-card" htmlFor="modalProfileSelect">
                <span className="card-label">Профиль математики</span>
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
                      {option.label} • RTP {option.targetRtp}%
                    </option>
                  ))}
                </select>
                <p>Меняет reel strips и таблицу выплат. При смене профиль сессии сбрасывается.</p>
              </label>
              <article className="setting-card">
                <span className="card-label">Текущий RTP</span>
                <strong>{formatRtpValue(profile.targetRtp)}%</strong>
                <p>Показывает RTP выбранного профиля без ручного редактирования.</p>
              </article>

              <label className="setting-card" htmlFor="modalAutoSpinSelect">
                <span className="card-label">Автоигра</span>
                <strong>{autoSpinCount} спинов</strong>
                <select
                  id="modalAutoSpinSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={autoSpinCount}
                  onChange={(event) => setAutoSpinCount(Number(event.target.value))}
                >
                  {AUTO_SPIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} автоспинов
                    </option>
                  ))}
                </select>
                <p>Выбирает длину серии autoplay. Запуск и остановка делаются кнопкой Авто под барабанами.</p>
              </label>

              <label className="setting-card" htmlFor="modalStopOnBonusSelect">
                <span className="card-label">Stop conditions</span>
                <strong>{stopOnBonus ? "Стоп по bonus" : "Стоп по big win / manual"}</strong>
                <select
                  id="modalStopOnBonusSelect"
                  className="profile-select"
                  disabled={spinning}
                  value={stopOnBonus ? "on" : "off"}
                  onChange={(event) => setStopOnBonus(event.target.value === "on")}
                >
                  <option value="on">Стоп при bonus trigger</option>
                  <option value="off">Не останавливать по bonus</option>
                </select>
                <select
                  className="profile-select"
                  disabled={spinning}
                  value={stopOnBigWin}
                  onChange={(event) => setStopOnBigWin(Number(event.target.value))}
                >
                  {BIG_WIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? "Без стопа по big win" : `Стоп при ${option}x ставки`}
                    </option>
                  ))}
                </select>
                <p>Можно остановить autoplay на bonus trigger или на big win относительно текущей ставки.</p>
              </label>

              <article className="setting-card">
                <span className="card-label">Таблица выплат</span>
                <div className="paytable">
                  {paytableRows.map((row) => (
                    <div className="paytable-row" key={`modal-${row.symbol.id}`}>
                      <span>{row.symbol.icon} {row.symbol.name}</span>
                      <span>x3 {row.payoutLabels[3]}</span>
                      <span>x4 {row.payoutLabels[4]}</span>
                      <span>x5 {row.payoutLabels[5]}</span>
                    </div>
                  ))}
                </div>
              </article>

              <label className="setting-card" htmlFor="modalSpeedSelect">
                <span className="card-label">Скорость игры</span>
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
                <p>Меняет длительность анимации и темп остановки барабанов.</p>
              </label>
            </div>
          </section>
        </div>
      ) : null}
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
                <h1>Приложение не отрисовалось</h1>
              </div>
            </header>
            <section className="machine-frame">
              <p>Ошибка React: {this.state.message}</p>
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





