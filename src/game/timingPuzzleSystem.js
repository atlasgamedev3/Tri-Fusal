// Timing puzzle logic for the second Tri-Fusal module.
// Each local POV owns one Space-bar challenge; completing all three secures the module.

const TIMING_PUZZLE_STATUS = Object.freeze({
  STANDBY: "standby",
  ACTIVE: "active",
  SOLVED: "solved",
});

const TIMING_PUZZLE_EVENTS = Object.freeze({
  ARMED: "armed",
  DISARMED: "disarmed",
  RESET: "reset",
  UPDATED: "updated",
  STRIKE: "strike",
  SECTION_COMPLETED: "sectionCompleted",
  SOLVED: "solved",
});

const TIMING_ROLE_IDS = Object.freeze({
  PLAYER_ONE: "timing-player-1",
  PLAYER_TWO: "timing-player-2",
  PLAYER_THREE: "timing-player-3",
});

const DEFAULT_TIMING_PUZZLE_CONFIG = Object.freeze({
  skillCycleMs: 1900,
  skillTargetWidth: 0.105,
  skillStreakGoal: 8,
  reactionWindowMs: 400,
  reactionGoal: 3,
  reactionDelayMinMs: 1200,
  reactionDelayMaxMs: 2800,
  balanceGoalMs: 6000,
  balanceLowerBound: 0.36,
  balanceUpperBound: 0.64,
  balanceMinimumWidth: 0.14,
  balanceEntryGraceMs: 2500,
  balanceStrikeGraceMs: 900,
  tickRateMs: 40,
  logLimit: 7,
});

class TimingPuzzleSystem {
  constructor(config = {}) {
    this.config = { ...DEFAULT_TIMING_PUZZLE_CONFIG, ...config };
    this.listeners = new Map();
    this.timerId = null;
    this.reset({ emitEvent: false });
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);
    return () => this.listeners.get(eventName)?.delete(callback);
  }

  arm() {
    if (this.isArmed || this.status === TIMING_PUZZLE_STATUS.SOLVED) {
      return this.getState();
    }

    this.isArmed = true;
    this.status = TIMING_PUZZLE_STATUS.ACTIVE;
    this.skillEpoch = Date.now();
    this.lastTickAt = Date.now();
    this.pushLog("Chronolock armed. Complete all three timing stations.", "info");
    this.startTicker();
    this.emit(TIMING_PUZZLE_EVENTS.ARMED);
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return this.getState();
  }

  disarm() {
    if (!this.isArmed) {
      return this.getState();
    }

    this.isArmed = false;
    this.stopTicker();
    this.emit(TIMING_PUZZLE_EVENTS.DISARMED);
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return this.getState();
  }

  reset(options = {}) {
    const shouldEmit = options.emitEvent ?? true;
    this.stopTicker();
    this.isArmed = false;
    this.status = TIMING_PUZZLE_STATUS.STANDBY;
    this.completedSections = new Set();
    this.skillTargetStart = randomBetween(0.12, 0.82);
    this.skillEpoch = Date.now();
    this.skillStreak = 0;
    this.reactionState = "idle";
    this.reactionHits = 0;
    this.reactionReadyAt = null;
    this.reactionDeadline = null;
    this.balanceState = "idle";
    this.balancePosition = 0.18;
    this.balanceVelocity = 0;
    this.balanceProgressMs = 0;
    this.balanceChallengeMs = 0;
    this.balanceOutOfBoundsMs = 0;
    this.balanceHasEnteredSafeZone = false;
    this.lastTickAt = null;
    this.lastStrike = null;
    this.logs = [];
    this.pushLog("Chronolock reset. Arm the round when all operators are ready.", "info");

    if (shouldEmit) {
      this.emit(TIMING_PUZZLE_EVENTS.RESET);
      this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    }

    return this.getState();
  }

  pressSkillCheck(now = Date.now()) {
    if (!this.canPlaySection("skill")) {
      return false;
    }

    const phase = this.getSkillPhase(now);
    const hit = isPhaseInsideTarget(phase, this.skillTargetStart, this.config.skillTargetWidth);

    if (!hit) {
      this.skillStreak = 0;
      this.skillTargetStart = randomBetween(0.08, 0.86);
      this.skillEpoch = now;
      this.applyStrike("skillMiss", "Skill check missed. Eight-hit streak reset.");
      return false;
    }

    this.skillStreak += 1;
    this.lastStrike = null;

    if (this.skillStreak >= this.config.skillStreakGoal) {
      this.completeSection("skill", "Player 1 completed eight consecutive timing locks.");
      return true;
    }

    this.skillTargetStart = randomBetween(0.08, 0.86);
    this.skillEpoch = now;
    this.pushLog(
      "Skill check " + this.skillStreak + "/" + this.config.skillStreakGoal + " locked. Keep the streak alive.",
      "success",
    );
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  startReactionSequence(now = Date.now()) {
    if (!this.canPlaySection("reaction") || this.reactionState !== "idle") {
      return false;
    }

    this.reactionHits = 0;
    this.scheduleReaction(now);
    this.pushLog("Player 2 reaction sequence started. Wait for green.", "info");
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  pressReaction(now = Date.now()) {
    if (!this.canPlaySection("reaction")) {
      return false;
    }

    if (this.reactionState === "idle") {
      return this.startReactionSequence(now);
    }

    if (this.reactionState === "waiting") {
      this.failReaction("Reaction pressed early. Wait for the lamp to turn green.", now);
      return false;
    }

    if (this.reactionState !== "ready" || now > this.reactionDeadline) {
      this.failReaction(
        "Reaction window missed. The response must land within " + this.config.reactionWindowMs + " ms.",
        now,
      );
      return false;
    }

    this.reactionHits += 1;
    this.lastStrike = null;
    this.pushLog("Reaction hit " + this.reactionHits + "/" + this.config.reactionGoal + " registered.", "success");

    if (this.reactionHits >= this.config.reactionGoal) {
      this.reactionState = "complete";
      this.reactionReadyAt = null;
      this.reactionDeadline = null;
      this.completeSection("reaction", "Player 2 cleared all three reflex gates.");
      return true;
    }

    this.scheduleReaction(now + 360);
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  pressBalance(now = Date.now()) {
    if (!this.canPlaySection("balance")) {
      return false;
    }

    if (this.balanceState === "idle") {
      this.balanceState = "active";
      this.balancePosition = 0.18;
      this.balanceVelocity = 0.16;
      this.balanceProgressMs = 0;
      this.balanceChallengeMs = 0;
      this.balanceOutOfBoundsMs = 0;
      this.balanceHasEnteredSafeZone = false;
      this.lastTickAt = now;
      this.pushLog("Player 3 balance regulator engaged. Tap Space with a steady cadence.", "info");
    } else {
      this.balanceVelocity = Math.min(0.3, this.balanceVelocity + 0.145);
    }

    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  tick(now = Date.now()) {
    if (!this.isArmed || this.status === TIMING_PUZZLE_STATUS.SOLVED) {
      this.stopTicker();
      return;
    }

    const deltaMs = Math.min(100, Math.max(0, now - (this.lastTickAt ?? now)));
    const deltaSeconds = deltaMs / 1000;
    this.lastTickAt = now;

    if (this.reactionState === "waiting" && now >= this.reactionReadyAt) {
      this.reactionState = "ready";
      this.reactionDeadline = this.reactionReadyAt + this.config.reactionWindowMs;
    } else if (this.reactionState === "ready" && now > this.reactionDeadline) {
      this.failReaction(
        "Reaction window expired. The response must land within " + this.config.reactionWindowMs + " ms.",
        now,
      );
    }

    if (this.balanceState === "active") {
      this.balanceChallengeMs = Math.min(this.config.balanceGoalMs, this.balanceChallengeMs + deltaMs);
      this.balanceVelocity -= 0.31 * deltaSeconds;
      this.balanceVelocity *= Math.pow(0.74, deltaSeconds);
      this.balancePosition += this.balanceVelocity * deltaSeconds;

      const balanceBounds = this.getBalanceBounds();
      const inside =
        this.balancePosition >= balanceBounds.lower &&
        this.balancePosition <= balanceBounds.upper;

      if (inside) {
        this.balanceHasEnteredSafeZone = true;
        this.balanceProgressMs += deltaMs;
        this.balanceOutOfBoundsMs = 0;
      } else {
        this.balanceProgressMs = 0;
        this.balanceOutOfBoundsMs += deltaMs;
      }

      if (this.balanceProgressMs >= this.config.balanceGoalMs) {
        this.balanceState = "complete";
        this.completeSection("balance", "Player 3 held the regulator inside tolerance.");
        return;
      }

      if (
        this.balanceOutOfBoundsMs >=
          (this.balanceHasEnteredSafeZone ? this.config.balanceStrikeGraceMs : this.config.balanceEntryGraceMs) ||
        this.balancePosition < 0.04 ||
        this.balancePosition > 0.96
      ) {
        this.balanceState = "idle";
        this.balancePosition = 0.18;
        this.balanceVelocity = 0;
        this.balanceProgressMs = 0;
        this.balanceChallengeMs = 0;
        this.balanceOutOfBoundsMs = 0;
        this.balanceHasEnteredSafeZone = false;
        this.applyStrike("balanceLost", "Balance regulator left tolerance. Sequence reset.");
        return;
      }
    }

    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
  }

  getState(now = Date.now()) {
    const completed = [...this.completedSections];
    const skillPhase = this.getSkillPhase(now);
    const reactionRemainingMs =
      this.reactionState === "ready" ? Math.max(0, this.reactionDeadline - now) : 0;
    const balanceBounds = this.getBalanceBounds();
    const balanceInside = this.balancePosition >= balanceBounds.lower && this.balancePosition <= balanceBounds.upper;

    return {
      isArmed: this.isArmed,
      status: this.status,
      statusLabel: this.getStatusLabel(),
      completedSections: completed,
      completedCount: completed.length,
      isSolved: this.status === TIMING_PUZZLE_STATUS.SOLVED,
      skill: {
        isComplete: this.completedSections.has("skill"),
        streak: this.skillStreak,
        goal: this.config.skillStreakGoal,
        phase: skillPhase,
        angle: skillPhase * 360,
        targetStart: this.skillTargetStart,
        targetWidth: this.config.skillTargetWidth,
      },
      reaction: {
        isComplete: this.completedSections.has("reaction"),
        state: this.reactionState,
        hits: this.reactionHits,
        goal: this.config.reactionGoal,
        windowMs: this.config.reactionWindowMs,
        remainingMs: reactionRemainingMs,
      },
      balance: {
        isComplete: this.completedSections.has("balance"),
        state: this.balanceState,
        position: clamp(this.balancePosition, 0, 1),
        lowerBound: balanceBounds.lower,
        upperBound: balanceBounds.upper,
        safeWidthPercent: balanceBounds.width * 100,
        isInside: balanceInside,
        progressPercent: Math.min(100, (this.balanceProgressMs / this.config.balanceGoalMs) * 100),
        goalMs: this.config.balanceGoalMs,
      },
      lastStrike: this.lastStrike ? { ...this.lastStrike } : null,
      logs: this.logs.map((entry) => ({ ...entry })),
    };
  }

  getSkillPhase(now = Date.now()) {
    return ((now - this.skillEpoch) % this.config.skillCycleMs) / this.config.skillCycleMs;
  }

  getBalanceBounds() {
    const startingWidth = this.config.balanceUpperBound - this.config.balanceLowerBound;
    const shrinkProgress = Math.min(1, this.balanceChallengeMs / this.config.balanceGoalMs);
    const width = startingWidth + (this.config.balanceMinimumWidth - startingWidth) * shrinkProgress;
    return {
      lower: 0.5 - width / 2,
      upper: 0.5 + width / 2,
      width,
    };
  }

  getStatusLabel() {
    if (this.status === TIMING_PUZZLE_STATUS.SOLVED) {
      return "Secured";
    }

    if (!this.isArmed) {
      return "Standby";
    }

    return this.completedSections.size + "/3 Synced";
  }

  canPlaySection(sectionId) {
    return this.isArmed && !this.completedSections.has(sectionId) && this.status !== TIMING_PUZZLE_STATUS.SOLVED;
  }

  scheduleReaction(fromTime) {
    this.reactionState = "waiting";
    this.reactionReadyAt = fromTime + randomInt(this.config.reactionDelayMinMs, this.config.reactionDelayMaxMs);
    this.reactionDeadline = null;
  }

  failReaction(message, now) {
    this.reactionState = "idle";
    this.reactionHits = 0;
    this.reactionReadyAt = null;
    this.reactionDeadline = null;
    this.applyStrike("reactionMiss", message);
  }

  completeSection(sectionId, message) {
    if (this.completedSections.has(sectionId)) {
      return;
    }

    this.completedSections.add(sectionId);
    this.lastStrike = null;
    this.pushLog(message, "success");
    this.emit(TIMING_PUZZLE_EVENTS.SECTION_COMPLETED, { sectionId });

    if (this.completedSections.size === 3) {
      this.status = TIMING_PUZZLE_STATUS.SOLVED;
      this.isArmed = false;
      this.stopTicker();
      this.pushLog("All timing channels synchronized. Chronolock secured.", "success");
      this.emit(TIMING_PUZZLE_EVENTS.SOLVED);
    }

    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
  }

  applyStrike(reason, message) {
    this.lastStrike = { reason, message, at: Date.now() };
    this.pushLog(message, "danger");
    this.emit(TIMING_PUZZLE_EVENTS.STRIKE, this.lastStrike);
    this.emit(TIMING_PUZZLE_EVENTS.UPDATED);
  }

  pushLog(message, tone = "info") {
    this.logs.unshift({ id: Math.random().toString(36).slice(2), message, tone });
    this.logs = this.logs.slice(0, this.config.logLimit);
  }

  startTicker() {
    if (!this.timerId) {
      this.lastTickAt = Date.now();
      this.timerId = setInterval(() => this.tick(), this.config.tickRateMs);
    }
  }

  stopTicker() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  emit(eventName, detail = {}) {
    const event = { type: eventName, detail, state: this.getState() };
    for (const callback of this.listeners.get(eventName) ?? []) {
      callback(event);
    }
  }
}

function isPhaseInsideTarget(phase, start, width) {
  const end = start + width;
  return end <= 1 ? phase >= start && phase <= end : phase >= start || phase <= end - 1;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export {
  DEFAULT_TIMING_PUZZLE_CONFIG,
  TIMING_PUZZLE_EVENTS,
  TIMING_PUZZLE_STATUS,
  TIMING_ROLE_IDS,
  TimingPuzzleSystem,
};
