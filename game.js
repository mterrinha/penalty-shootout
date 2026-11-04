(() => {
  const ZONES = [
    "top-left", "top-center", "top-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  const TOTAL_SHOTS = 5;
  const KEEPER_BIAS_STRENGTH = 0.5; // 0 = ignores history (pure random), 1 = always matches your zone frequencies
  const KEEPER_MIN_SAMPLE = 5; // shots of history needed before the keeper starts leaning on it

  const state = {
    shot: 0,
    score: 0,
    busy: false,
  };

  const goalEl = document.getElementById("goal");
  const keeperEl = document.getElementById("keeper");
  const ballEl = document.getElementById("ball");
  const messageEl = document.getElementById("message");
  const shotCountEl = document.getElementById("shot-count");
  const scoreCountEl = document.getElementById("score-count");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayScoreEl = document.getElementById("overlay-score");
  const overlayBestEl = document.getElementById("overlay-best");
  const overlayStreakEl = document.getElementById("overlay-streak");
  const actionBtn = document.getElementById("action-btn");
  const statsBtn = document.getElementById("stats-btn");
  const statsBackBtn = document.getElementById("stats-back-btn");
  const statsOverlayEl = document.getElementById("stats-overlay");
  const statGamesStartedEl = document.getElementById("stat-games-started");
  const statCompletionRateEl = document.getElementById("stat-completion-rate");
  const statAvgScoreEl = document.getElementById("stat-avg-score");
  const statKeeperDifficultyEl = document.getElementById("stat-keeper-difficulty");
  const zoneChartEl = document.getElementById("zone-chart");
  const pauseBtn = document.getElementById("pause-btn");
  const pauseOverlayEl = document.getElementById("pause-overlay");
  const resumeBtn = document.getElementById("resume-btn");
  const difficultyDescEl = document.getElementById("difficulty-desc");
  const diffButtons = Array.from(document.querySelectorAll(".diff-btn"));
  const zoneButtons = Array.from(document.querySelectorAll(".zone"));

  const ZONE_LABELS = {
    "top-left": "TL", "top-center": "TC", "top-right": "TR",
    "bottom-left": "BL", "bottom-center": "BC", "bottom-right": "BR",
  };

  const STORAGE_KEYS = {
    best: "ps_best_score",
    streak: "ps_streak",
    lastPlayed: "ps_last_played",
    events: "ps_events",
    difficulty: "ps_difficulty",
  };
  const MAX_EVENTS = 1000;
  const DEFAULT_DIFFICULTY = "hard";
  const DIFFICULTY_DESCRIPTIONS = {
    easy: "Easy: the keeper dives to a random zone.",
    hard: "Hard: the keeper leans toward your most-used zones.",
  };

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function dateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function readStat(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writeStat(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — fail silently
    }
  }

  function getBestScore() {
    return parseInt(readStat(STORAGE_KEYS.best, "0"), 10) || 0;
  }

  function getStreak() {
    return parseInt(readStat(STORAGE_KEYS.streak, "0"), 10) || 0;
  }

  function getDifficulty() {
    const d = readStat(STORAGE_KEYS.difficulty, DEFAULT_DIFFICULTY);
    return d === "easy" ? "easy" : "hard";
  }

  function setDifficulty(difficulty) {
    writeStat(STORAGE_KEYS.difficulty, difficulty === "easy" ? "easy" : "hard");
  }

  function updateBestScore(score) {
    const best = getBestScore();
    if (score > best) {
      writeStat(STORAGE_KEYS.best, score);
      return score;
    }
    return best;
  }

  function registerPlaySession() {
    const today = todayStr();
    const lastPlayed = readStat(STORAGE_KEYS.lastPlayed, null);

    if (lastPlayed === today) {
      return getStreak();
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    let streak = getStreak();
    streak = lastPlayed === dateStr(yesterday) ? streak + 1 : 1;

    writeStat(STORAGE_KEYS.streak, streak);
    writeStat(STORAGE_KEYS.lastPlayed, today);
    return streak;
  }

  function renderStats() {
    const best = getBestScore();
    const streak = getStreak();
    overlayBestEl.textContent = `${best} / ${TOTAL_SHOTS}`;
    overlayStreakEl.textContent = streak === 1 ? "1 day" : `${streak} days`;
  }

  function logEvent(type, data) {
    try {
      const events = JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || "[]");
      events.push({ type, ts: Date.now(), ...data });
      const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
      localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(trimmed));
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — fail silently
    }
  }

  function readEvents() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.events) || "[]");
    } catch (e) {
      return [];
    }
  }

  function computeEventStats() {
    const events = readEvents();
    const gamesStarted = events.filter((e) => e.type === "game_started").length;
    const completed = events.filter((e) => e.type === "game_completed");
    const gamesCompleted = completed.length;
    const completionRate = gamesStarted > 0 ? Math.round((gamesCompleted / gamesStarted) * 100) : 0;
    const avgScore = gamesCompleted > 0
      ? completed.reduce((sum, e) => sum + e.score, 0) / gamesCompleted
      : 0;

    const shots = events.filter((e) => e.type === "shot_taken");
    const zoneGoalRate = {};
    ZONES.forEach((zone) => {
      const zoneShots = shots.filter((e) => e.zone === zone);
      const zoneGoals = zoneShots.filter((e) => e.result === "goal");
      zoneGoalRate[zone] = zoneShots.length > 0
        ? Math.round((zoneGoals.length / zoneShots.length) * 100)
        : 0;
    });

    return { gamesStarted, gamesCompleted, completionRate, avgScore, zoneGoalRate };
  }

  function renderStatsScreen() {
    const stats = computeEventStats();
    statGamesStartedEl.textContent = String(stats.gamesStarted);
    statCompletionRateEl.textContent = `${stats.completionRate}%`;
    statAvgScoreEl.textContent = `${stats.avgScore.toFixed(1)} / ${TOTAL_SHOTS}`;
    statKeeperDifficultyEl.textContent = `${computeKeeperDifficulty()}%`;

    zoneChartEl.innerHTML = "";
    ZONES.forEach((zone) => {
      const rate = stats.zoneGoalRate[zone];
      const col = document.createElement("div");
      col.className = "bar-col";
      col.innerHTML = `
        <span class="bar-value">${rate}%</span>
        <div class="bar-track"><div class="bar-fill" style="height: ${rate}%"></div></div>
        <span class="bar-label">${ZONE_LABELS[zone]}</span>
      `;
      zoneChartEl.appendChild(col);
    });
  }

  function getPlayerZoneCounts() {
    const shots = readEvents().filter((e) => e.type === "shot_taken");
    const counts = {};
    ZONES.forEach((zone) => { counts[zone] = 0; });
    shots.forEach((e) => {
      if (counts[e.zone] !== undefined) counts[e.zone] += 1;
    });
    return { counts, total: shots.length };
  }

  // Blends a uniform distribution with the player's historical zone frequencies,
  // so the keeper leans toward zones the player tends to shoot at.
  function getKeeperWeights() {
    const { counts, total } = getPlayerZoneCounts();
    const weights = {};

    if (total < KEEPER_MIN_SAMPLE) {
      ZONES.forEach((zone) => { weights[zone] = 1; });
      return weights;
    }

    ZONES.forEach((zone) => {
      const freq = counts[zone] / total;
      weights[zone] = (1 - KEEPER_BIAS_STRENGTH) + KEEPER_BIAS_STRENGTH * ZONES.length * freq;
    });
    return weights;
  }

  function weightedRandomZone(weights) {
    const totalWeight = ZONES.reduce((sum, zone) => sum + weights[zone], 0);
    let r = Math.random() * totalWeight;
    for (const zone of ZONES) {
      r -= weights[zone];
      if (r <= 0) return zone;
    }
    return ZONES[ZONES.length - 1];
  }

  function pickKeeperZone() {
    if (getDifficulty() === "easy") {
      return ZONES[Math.floor(Math.random() * ZONES.length)];
    }
    return weightedRandomZone(getKeeperWeights());
  }

  // "Keeper difficulty" = the share of dive probability the keeper puts on
  // your single most-shot zone — higher means it's reading you more.
  function computeKeeperDifficulty() {
    if (getDifficulty() === "easy") {
      return Math.round(100 / ZONES.length);
    }
    const weights = getKeeperWeights();
    const totalWeight = ZONES.reduce((sum, zone) => sum + weights[zone], 0);
    const maxWeight = Math.max(...ZONES.map((zone) => weights[zone]));
    return Math.round((maxWeight / totalWeight) * 100);
  }

  function setZonesEnabled(enabled) {
    zoneButtons.forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  function clearZoneResultClasses() {
    zoneButtons.forEach((btn) => {
      btn.classList.remove("result-save", "result-goal");
    });
  }

  function resetBall() {
    ballEl.style.transition = "none";
    ballEl.classList.remove(
      "flying-top-left", "flying-top-center", "flying-top-right",
      "flying-bottom-left", "flying-bottom-center", "flying-bottom-right"
    );
    ballEl.style.opacity = "1";
    // force reflow so next transition applies cleanly
    void ballEl.offsetWidth;
    ballEl.style.transition = "";
  }

  function resetKeeper() {
    keeperEl.className = "keeper";
  }

  function updateHud() {
    const shown = Math.min(state.shot + 1, TOTAL_SHOTS);
    shotCountEl.textContent = `${state.shot >= TOTAL_SHOTS ? TOTAL_SHOTS : shown} / ${TOTAL_SHOTS}`;
    scoreCountEl.textContent = String(state.score);
  }

  function setMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.classList.remove("save", "goal");
    if (kind) messageEl.classList.add(kind);
  }

  function handleShot(zone) {
    if (state.busy || state.shot >= TOTAL_SHOTS) return;
    state.busy = true;
    setZonesEnabled(false);
    setMessage("", null);
    clearZoneResultClasses();

    const keeperZone = pickKeeperZone();

    ballEl.classList.add(`flying-${zone}`);
    keeperEl.classList.add(`dive-${keeperZone}`);

    setTimeout(() => {
      const isSave = zone === keeperZone;

      if (isSave) {
        state.score += 0;
        setMessage("SAVED!", "save");
      } else {
        state.score += 1;
        setMessage("GOAL!", "goal");
      }

      const btn = zoneButtons.find((b) => b.dataset.zone === zone);
      if (btn) btn.classList.add(isSave ? "result-save" : "result-goal");

      logEvent("shot_taken", { zone, result: isSave ? "save" : "goal" });

      state.shot += 1;
      updateHud();

      setTimeout(() => {
        if (state.shot >= TOTAL_SHOTS) {
          endGame();
        } else {
          resetBall();
          resetKeeper();
          clearZoneResultClasses();
          setMessage("", null);
          setZonesEnabled(true);
          state.busy = false;
        }
      }, 1100);
    }, 420);
  }

  function endGame() {
    logEvent("game_completed", { score: state.score, total: TOTAL_SHOTS });
    updateBestScore(state.score);
    renderStats();
    overlayTitleEl.textContent = "Game Over";
    overlayScoreEl.textContent = `You scored ${state.score} out of ${TOTAL_SHOTS}`;
    actionBtn.textContent = "Play again";
    overlayEl.classList.add("visible");
  }

  function showStartScreen() {
    renderStats();
    overlayTitleEl.textContent = "Penalty Shootout";
    overlayScoreEl.textContent = "Score as many as you can in 5 shots!";
    actionBtn.textContent = "Play";
    overlayEl.classList.add("visible");
  }

  function startGame() {
    registerPlaySession();
    logEvent("game_started");
    renderStats();
    state.shot = 0;
    state.score = 0;
    state.busy = false;
    resetBall();
    resetKeeper();
    clearZoneResultClasses();
    setMessage("Pick your spot!", null);
    updateHud();
    setZonesEnabled(true);
    overlayEl.classList.remove("visible");
  }

  function renderDifficultyToggle() {
    const current = getDifficulty();
    diffButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.difficulty === current);
    });
    difficultyDescEl.textContent = DIFFICULTY_DESCRIPTIONS[current];
  }

  function openPauseMenu() {
    renderDifficultyToggle();
    pauseOverlayEl.classList.add("visible");
  }

  function closePauseMenu() {
    pauseOverlayEl.classList.remove("visible");
  }

  zoneButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleShot(btn.dataset.zone));
  });

  actionBtn.addEventListener("click", startGame);

  pauseBtn.addEventListener("click", () => {
    if (state.busy) return;
    openPauseMenu();
  });

  resumeBtn.addEventListener("click", closePauseMenu);

  diffButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setDifficulty(btn.dataset.difficulty);
      renderDifficultyToggle();
    });
  });

  statsBtn.addEventListener("click", () => {
    renderStatsScreen();
    overlayEl.classList.remove("visible");
    statsOverlayEl.classList.add("visible");
  });

  statsBackBtn.addEventListener("click", () => {
    statsOverlayEl.classList.remove("visible");
    overlayEl.classList.add("visible");
  });

  setZonesEnabled(false);
  showStartScreen();
})();
