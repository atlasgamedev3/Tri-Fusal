// Core bomb timer and win/fail state for Tri-Fusal.
// This file has no screen or button code on purpose. Puzzle files can use it without caring about UI.

// The first prototype round lasts 15 minutes.
const DEFAULT_BOMB_DURATION_MS = 15 * 60 * 1000;

// The timer checks four times per second so the display feels responsive without doing extra work.
const DEFAULT_TICK_RATE_MS = 250;

// These are the only major states the bomb can be in.
const BOMB_STATUS = Object.freeze({
  READY: "ready",
  RUNNING: "running",
  DEFUSED: "defused",
  DETONATED: "detonated",
});

// Event names let UI, sound, and puzzle code react without being tightly connected.
const BOMB_EVENTS = Object.freeze({
  STARTED: "started",
  TICK: "tick",
  PUZZLE_COMPLETED: "puzzleCompleted",
  PUZZLE_RESET: "puzzleReset",
  DEFUSED: "defused",
  DETONATED: "detonated",
  RESET: "reset",
  STOPPED: "stopped",
});

// Shared config for the current plan: two puzzles, 15 minutes, no difficulty levels yet.
const TWO_PUZZLE_BOMB_CONFIG = Object.freeze({
  durationMs: DEFAULT_BOMB_DURATION_MS,
  puzzleIds: ["puzzle-1", "puzzle-2"],
});

class BombSystem {
  constructor(config = {}) {
    // Duration can later come from difficulty settings. For now it defaults to 15 minutes.
    this.durationMs = config.durationMs ?? DEFAULT_BOMB_DURATION_MS;

    // Puzzle IDs are the required modules the players must solve before time runs out.
    this.puzzleIds = [...(config.puzzleIds ?? TWO_PUZZLE_BOMB_CONFIG.puzzleIds)];

    // Tick rate controls how often the system checks the countdown.
    this.tickRateMs = config.tickRateMs ?? DEFAULT_TICK_RATE_MS;

    // listeners stores callbacks registered with on().
    this.listeners = new Map();

    // timerId stores the browser interval so it can be stopped cleanly.
    this.timerId = null;

    this.reset({ emitEvent: false });
  }

  /**
   * Registers a callback for one bomb event.
   * Returns an unsubscribe function so screens can clean up later.
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => {
      this.listeners.get(eventName)?.delete(callback);
    };
  }

  /**
   * Starts or resumes the countdown.
   */
  start(now = Date.now()) {
    if (this.status === BOMB_STATUS.RUNNING) {
      return this.getState();
    }

    // Starting after a finished round should begin a fresh round.
    if (this.status === BOMB_STATUS.DEFUSED || this.status === BOMB_STATUS.DETONATED) {
      this.reset({ emitEvent: false });
    }

    this.status = BOMB_STATUS.RUNNING;
    this.startedAt = now;
    this.endsAt = now + this.remainingMs;
    this.startTimer();
    this.emit(BOMB_EVENTS.STARTED);
    this.emit(BOMB_EVENTS.TICK);

    return this.getState();
  }

  /**
   * Stops the countdown without causing a win or failure state.
   * This is useful for pause menus or leaving the round.
   */
  stop() {
    if (this.status !== BOMB_STATUS.RUNNING) {
      return this.getState();
    }

    this.remainingMs = this.getRemainingMs();
    this.status = BOMB_STATUS.READY;
    this.stopTimer();
    this.emit(BOMB_EVENTS.STOPPED);

    return this.getState();
  }

  /**
   * Resets the timer, clears puzzle progress, and returns the bomb to ready state.
   */
  reset(options = {}) {
    const shouldEmit = options.emitEvent ?? true;

    this.stopTimer();
    this.status = BOMB_STATUS.READY;
    this.startedAt = null;
    this.endsAt = null;
    this.remainingMs = options.durationMs ?? this.durationMs;

    if (options.puzzleIds) {
      this.puzzleIds = [...options.puzzleIds];
    }

    // Each puzzle starts unsolved. Completing all of them defuses the bomb.
    this.puzzles = new Map(
      this.puzzleIds.map((id) => [
        id,
        {
          id,
          isSolved: false,
          solvedAt: null,
        },
      ]),
    );

    if (shouldEmit) {
      this.emit(BOMB_EVENTS.RESET);
      this.emit(BOMB_EVENTS.TICK);
    }

    return this.getState();
  }

  /**
   * Marks one puzzle as solved.
   * If that completes every required puzzle, the bomb is defused immediately.
   */
  completePuzzle(puzzleId, solvedAt = Date.now()) {
    const puzzle = this.puzzles.get(puzzleId);

    if (!puzzle) {
      console.warn("[BombSystem] Unknown puzzle id: " + puzzleId);
      return false;
    }

    if (this.status === BOMB_STATUS.DEFUSED || this.status === BOMB_STATUS.DETONATED) {
      return false;
    }

    if (puzzle.isSolved) {
      return true;
    }

    puzzle.isSolved = true;
    puzzle.solvedAt = solvedAt;
    this.emit(BOMB_EVENTS.PUZZLE_COMPLETED, { puzzleId });

    if (this.areAllPuzzlesSolved()) {
      this.defuse();
    }

    return true;
  }

  /**
   * Marks one puzzle as unsolved again.
   * This is mostly useful for testing or puzzle reset buttons.
   */
  resetPuzzle(puzzleId) {
    const puzzle = this.puzzles.get(puzzleId);

    if (!puzzle) {
      console.warn("[BombSystem] Unknown puzzle id: " + puzzleId);
      return false;
    }

    puzzle.isSolved = false;
    puzzle.solvedAt = null;
    this.emit(BOMB_EVENTS.PUZZLE_RESET, { puzzleId });

    return true;
  }

  /**
   * Forces the win state and stops the timer.
   */
  defuse() {
    if (this.status === BOMB_STATUS.DEFUSED) {
      return this.getState();
    }

    this.remainingMs = this.getRemainingMs();
    this.status = BOMB_STATUS.DEFUSED;
    this.stopTimer();
    this.emit(BOMB_EVENTS.DEFUSED);

    return this.getState();
  }

  /**
   * Forces the fail state and stops the timer.
   */
  detonate() {
    if (this.status === BOMB_STATUS.DETONATED) {
      return this.getState();
    }

    this.remainingMs = 0;
    this.status = BOMB_STATUS.DETONATED;
    this.stopTimer();
    this.emit(BOMB_EVENTS.DETONATED);

    return this.getState();
  }

  /**
   * Returns true only when every required puzzle is solved.
   */
  areAllPuzzlesSolved() {
    return this.getSolvedCount() === this.puzzles.size;
  }

  /**
   * Counts solved puzzles.
   */
  getSolvedCount() {
    let solvedCount = 0;

    for (const puzzle of this.puzzles.values()) {
      if (puzzle.isSolved) {
        solvedCount += 1;
      }
    }

    return solvedCount;
  }

  /**
   * Returns the current remaining time, calculated from the real clock while running.
   */
  getRemainingMs(now = Date.now()) {
    if (this.status !== BOMB_STATUS.RUNNING || !this.endsAt) {
      return Math.max(0, this.remainingMs);
    }

    return Math.max(0, this.endsAt - now);
  }

  /**
   * Builds one plain object that UI code can safely render.
   */
  getState() {
    const remainingMs = this.getRemainingMs();
    const solvedCount = this.getSolvedCount();
    const requiredPuzzleCount = this.puzzles.size;

    return {
      status: this.status,
      durationMs: this.durationMs,
      remainingMs,
      formattedTime: formatBombTime(remainingMs),
      solvedCount,
      requiredPuzzleCount,
      progress: requiredPuzzleCount === 0 ? 1 : solvedCount / requiredPuzzleCount,
      completedPuzzleIds: [...this.puzzles.values()]
        .filter((puzzle) => puzzle.isSolved)
        .map((puzzle) => puzzle.id),
      puzzles: [...this.puzzles.values()].map((puzzle) => ({ ...puzzle })),
    };
  }

  /**
   * Starts the timer interval. Time is always based on Date.now(), not interval counts.
   */
  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => this.tick(), this.tickRateMs);
  }

  /**
   * Stops the timer interval if one is running.
   */
  stopTimer() {
    if (!this.timerId) {
      return;
    }

    clearInterval(this.timerId);
    this.timerId = null;
  }

  /**
   * Checks the countdown and detonates when time reaches zero.
   */
  tick() {
    if (this.status !== BOMB_STATUS.RUNNING) {
      return;
    }

    this.remainingMs = this.getRemainingMs();

    if (this.remainingMs <= 0) {
      this.detonate();
      return;
    }

    this.emit(BOMB_EVENTS.TICK);
  }

  /**
   * Sends the latest state to every callback listening for this event.
   */
  emit(eventName, detail = {}) {
    const event = {
      type: eventName,
      detail,
      state: this.getState(),
    };

    for (const callback of this.listeners.get(eventName) ?? []) {
      callback(event);
    }
  }
}

/**
 * Formats milliseconds as MM:SS for the digital bomb clock.
 */
function formatBombTime(milliseconds) {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return minutes + ":" + seconds;
}

export {
  BOMB_EVENTS,
  BOMB_STATUS,
  BombSystem,
  DEFAULT_BOMB_DURATION_MS,
  DEFAULT_TICK_RATE_MS,
  TWO_PUZZLE_BOMB_CONFIG,
  formatBombTime,
};
