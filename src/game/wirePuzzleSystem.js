// Puzzle-specific logic for the first Tri-Fusal module.
// The UI can swap between three local roles today, and later those same actions can be driven by multiplayer clients.

const WIRE_PUZZLE_STATUS = Object.freeze({
  DIAGNOSING: "diagnosing",
  REROUTED: "rerouted",
  SAFE_WINDOW: "safeWindow",
  SOLVED: "solved",
});

const WIRE_PUZZLE_EVENTS = Object.freeze({
  ARMED: "armed",
  DISARMED: "disarmed",
  RESET: "reset",
  UPDATED: "updated",
  TESTED: "tested",
  REROUTED: "rerouted",
  SAFE_WINDOW_OPENED: "safeWindowOpened",
  STRIKE: "strike",
  SOLVED: "solved",
});

const DEFAULT_WIRE_PUZZLE_CONFIG = Object.freeze({
  wireCount: 6,
  safeWindowMs: 6500,
  stabilizationGoal: 100,
  stabilizationPulseMin: 18,
  stabilizationPulseMax: 28,
  stabilizationDecayPerSecond: 14,
  voltageDecayPerSecond: 34,
  tickRateMs: 100,
  logLimit: 7,
});

const ROLE_IDS = Object.freeze({
  PLAYER_ONE: "player-1",
  PLAYER_TWO: "player-2",
  PLAYER_THREE: "player-3",
});

const WIRE_LIBRARY = Object.freeze([
  { colorName: "Crimson", hex: "#d5534c" },
  { colorName: "Amber", hex: "#d8a653" },
  { colorName: "Cobalt", hex: "#4e83dc" },
  { colorName: "Teal", hex: "#3faea3" },
  { colorName: "Ivory", hex: "#d8d1c0" },
  { colorName: "Violet", hex: "#9170cf" },
  { colorName: "Verdant", hex: "#7bb86b" },
]);

class WirePuzzleSystem {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_WIRE_PUZZLE_CONFIG,
      ...config,
    };

    this.listeners = new Map();
    this.timerId = null;
    this.lastTickAt = null;
    this.reset({ emitEvent: false });
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    this.listeners.get(eventName).add(callback);

    return () => {
      this.listeners.get(eventName)?.delete(callback);
    };
  }

  arm() {
    if (this.isArmed) {
      return this.getState();
    }

    this.isArmed = true;
    this.lastTickAt = Date.now();
    this.pushLog("Module armed. Awaiting wire diagnostics.", "info");
    this.syncTicker();
    this.emit(WIRE_PUZZLE_EVENTS.ARMED);
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return this.getState();
  }

  disarm() {
    if (!this.isArmed) {
      return this.getState();
    }

    this.isArmed = false;
    this.safeWindowEndsAt = null;
    this.stopTicker();
    this.emit(WIRE_PUZZLE_EVENTS.DISARMED);
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return this.getState();
  }

  reset(options = {}) {
    const shouldEmit = options.emitEvent ?? true;
    const round = createRound(this.config.wireCount);

    this.stopTicker();
    this.isArmed = false;
    this.status = WIRE_PUZZLE_STATUS.DIAGNOSING;
    this.wires = round.wires;
    this.targetWireId = round.targetWireId;
    this.reroutedWireId = null;
    this.lastTestedWireId = null;
    this.lastStrike = null;
    this.voltageLevel = 0;
    this.stability = 0;
    this.safeWindowEndsAt = null;
    this.logs = [];
    this.pushLog("Fresh module seeded. Probe for the unstable lead before cutting.", "info");

    if (shouldEmit) {
      this.emit(WIRE_PUZZLE_EVENTS.RESET);
      this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    }

    return this.getState();
  }

  testWire(wireId) {
    if (!this.isArmed || this.status !== WIRE_PUZZLE_STATUS.DIAGNOSING) {
      return false;
    }

    const wire = this.getWire(wireId);

    if (!wire) {
      return false;
    }

    wire.testCount += 1;
    wire.lastTestedAt = Date.now();
    this.lastTestedWireId = wireId;
    this.voltageLevel = wire.spikeLevel;
    this.lastTickAt = Date.now();
    this.pushLog("Probe sent through " + wire.colorName + " lead. Meter response incoming.", "info");
    this.syncTicker();
    this.emit(WIRE_PUZZLE_EVENTS.TESTED, { wireId });
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  rerouteWire(wireId) {
    if (!this.isArmed || this.status !== WIRE_PUZZLE_STATUS.DIAGNOSING) {
      return false;
    }

    const wire = this.getWire(wireId);

    if (!wire) {
      return false;
    }

    this.status = WIRE_PUZZLE_STATUS.REROUTED;
    this.reroutedWireId = wireId;
    this.stability = 12;
    this.safeWindowEndsAt = null;
    this.lastTickAt = Date.now();
    this.pushLog("Power rerouted into " + wire.colorName + ". Stabilizer engagement required.", "warning");
    this.syncTicker();
    this.emit(WIRE_PUZZLE_EVENTS.REROUTED, { wireId });
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  pulseStabilizer() {
    if (!this.isArmed) {
      return false;
    }

    if (this.status !== WIRE_PUZZLE_STATUS.REROUTED && this.status !== WIRE_PUZZLE_STATUS.SAFE_WINDOW) {
      return false;
    }

    const activeWire = this.getWire(this.reroutedWireId);

    if (!activeWire) {
      return false;
    }

    this.stability = Math.min(
      this.config.stabilizationGoal,
      this.stability + randomInt(this.config.stabilizationPulseMin, this.config.stabilizationPulseMax),
    );
    this.voltageLevel = Math.max(this.voltageLevel, Math.max(36, activeWire.spikeLevel - 10));
    this.lastTickAt = Date.now();

    if (this.status === WIRE_PUZZLE_STATUS.REROUTED && this.stability >= this.config.stabilizationGoal) {
      this.status = WIRE_PUZZLE_STATUS.SAFE_WINDOW;
      this.safeWindowEndsAt = Date.now() + this.config.safeWindowMs;
      this.pushLog("Safe cut window open on " + activeWire.colorName + ". Player 1, cut now.", "success");
      this.emit(WIRE_PUZZLE_EVENTS.SAFE_WINDOW_OPENED, { wireId: activeWire.id });
    }

    this.syncTicker();
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  cutWire(wireId) {
    if (!this.isArmed || this.status === WIRE_PUZZLE_STATUS.SOLVED) {
      return false;
    }

    const wire = this.getWire(wireId);

    if (!wire) {
      return false;
    }

    if (wireId !== this.targetWireId) {
      this.applyStrike("wrongWire", "Incorrect lead cut. Timer penalty applied.", { wireId });
      return false;
    }

    if (this.status !== WIRE_PUZZLE_STATUS.SAFE_WINDOW || this.reroutedWireId !== wireId) {
      this.applyStrike("unsafeCut", "Correct lead, wrong timing. Stabilizer chain lost.", { wireId });
      return false;
    }

    wire.isCut = true;
    this.status = WIRE_PUZZLE_STATUS.SOLVED;
    this.safeWindowEndsAt = null;
    this.stability = this.config.stabilizationGoal;
    this.stopTicker();
    this.pushLog(wire.colorName + " lead severed cleanly. Module secured.", "success");
    this.emit(WIRE_PUZZLE_EVENTS.SOLVED, { wireId });
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    return true;
  }

  getState(now = Date.now()) {
    const activeWire = this.getWire(this.reroutedWireId);
    const lastTestedWire = this.getWire(this.lastTestedWireId);
    const safeWindowRemainingMs = this.getSafeWindowRemainingMs(now);

    return {
      isArmed: this.isArmed,
      status: this.status,
      statusLabel: this.isArmed ? getStatusLabel(this.status) : this.status === WIRE_PUZZLE_STATUS.SOLVED ? "Secured" : "Standby",
      instructionText: this.getInstructionText(),
      reroutedWireId: this.reroutedWireId,
      lastTestedWireId: this.lastTestedWireId,
      lastStrike: this.lastStrike ? { ...this.lastStrike } : null,
      voltageLevel: Math.round(this.voltageLevel),
      voltageBand: getVoltageBand(this.voltageLevel),
      stabilityPercent: Math.round((this.stability / this.config.stabilizationGoal) * 100),
      safeWindowRemainingMs,
      hasSafeWindow: safeWindowRemainingMs > 0,
      activeWireLabel: activeWire ? activeWire.colorName + " lead" : "None",
      lastTestedWireLabel: lastTestedWire ? lastTestedWire.colorName + " lead" : "No probe yet",
      wires: this.wires.map((wire) => ({
        id: wire.id,
        colorName: wire.colorName,
        hex: wire.hex,
        testCount: wire.testCount,
        isCut: wire.isCut,
        isRerouted: wire.id === this.reroutedWireId,
        isLastTested: wire.id === this.lastTestedWireId,
      })),
      logs: this.logs.map((entry) => ({ ...entry })),
    };
  }

  getRoleState(roleId, now = Date.now()) {
    const state = this.getState(now);

    if (roleId === ROLE_IDS.PLAYER_TWO) {
      return {
        ...state,
        roleId,
        roleName: "Player 2",
        panelTitle: "Power Reroute Console",
        instruction: "Probe every lead until Player 3 spots the harshest spike, then reroute that line.",
        wires: state.wires.map((wire) => ({
          ...wire,
          wireLabel: wire.colorName + " channel",
          canProbe: state.isArmed && state.status === WIRE_PUZZLE_STATUS.DIAGNOSING,
          canReroute: state.isArmed && state.status === WIRE_PUZZLE_STATUS.DIAGNOSING,
        })),
      };
    }

    if (roleId === ROLE_IDS.PLAYER_THREE) {
      return {
        ...state,
        roleId,
        roleName: "Player 3",
        panelTitle: "Stabilizer Array",
        instruction: "Watch the spike meter, then charge the stabilizer until the safe cut window opens.",
        canStabilize:
          state.isArmed &&
          (state.status === WIRE_PUZZLE_STATUS.REROUTED || state.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW),
      };
    }

    return {
      ...state,
      roleId: ROLE_IDS.PLAYER_ONE,
      roleName: "Player 1",
      panelTitle: "Main Wire Panel",
      instruction: "Only cut the confirmed unstable lead, and only during the safe window.",
      wires: state.wires.map((wire) => ({
        ...wire,
        wireLabel: wire.colorName + " lead",
        canCut: state.isArmed && state.status !== WIRE_PUZZLE_STATUS.SOLVED,
      })),
    };
  }

  tick() {
    if (!this.isArmed) {
      this.stopTicker();
      return;
    }

    const now = Date.now();
    const deltaSeconds = Math.max(0, (now - (this.lastTickAt ?? now)) / 1000);
    this.lastTickAt = now;

    const hadVoltage = this.voltageLevel > 0;
    const hadStability = this.stability > 0;

    if (this.voltageLevel > 0) {
      this.voltageLevel = Math.max(0, this.voltageLevel - this.config.voltageDecayPerSecond * deltaSeconds);
    }

    if (this.status === WIRE_PUZZLE_STATUS.REROUTED || this.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW) {
      this.stability = Math.max(0, this.stability - this.config.stabilizationDecayPerSecond * deltaSeconds);
    }

    if (this.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW && this.getSafeWindowRemainingMs(now) <= 0) {
      this.applyStrike("missedWindow", "Safe cut window missed. The reroute chain collapsed.");
      return;
    }

    this.syncTicker();

    if (hadVoltage || hadStability || this.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW) {
      this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
    }
  }

  applyStrike(reason, message, detail = {}) {
    this.status = WIRE_PUZZLE_STATUS.DIAGNOSING;
    this.reroutedWireId = null;
    this.stability = 0;
    this.safeWindowEndsAt = null;
    this.lastStrike = {
      reason,
      message,
      at: Date.now(),
      ...detail,
    };
    this.voltageLevel = Math.max(this.voltageLevel, 82);
    this.pushLog(message, "danger");
    this.lastTickAt = Date.now();
    this.syncTicker();
    this.emit(WIRE_PUZZLE_EVENTS.STRIKE, this.lastStrike);
    this.emit(WIRE_PUZZLE_EVENTS.UPDATED);
  }

  getInstructionText() {
    if (!this.isArmed) {
      return "Start the round to arm the module and enable all three stations.";
    }

    if (this.status === WIRE_PUZZLE_STATUS.SOLVED) {
      return "The unstable lead is secured. Move on to the next module.";
    }

    if (this.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW) {
      return "Safe cut window is live. Player 1 must sever the rerouted lead before it collapses.";
    }

    if (this.status === WIRE_PUZZLE_STATUS.REROUTED) {
      return "Power is rerouted. Player 3 must charge the stabilizer before the cut can happen.";
    }

    return "Player 2 should probe leads while Player 3 watches for the harshest voltage spike.";
  }

  getSafeWindowRemainingMs(now = Date.now()) {
    if (!this.safeWindowEndsAt) {
      return 0;
    }

    return Math.max(0, this.safeWindowEndsAt - now);
  }

  getWire(wireId) {
    return this.wires.find((wire) => wire.id === wireId) ?? null;
  }

  pushLog(message, tone = "info") {
    this.logs.unshift({
      id: createId(),
      message,
      tone,
    });
    this.logs = this.logs.slice(0, this.config.logLimit);
  }

  syncTicker() {
    if (this.needsTicker()) {
      if (!this.timerId) {
        this.lastTickAt = Date.now();
        this.timerId = setInterval(() => this.tick(), this.config.tickRateMs);
      }

      return;
    }

    this.stopTicker();
  }

  needsTicker() {
    return (
      this.isArmed &&
      (this.status === WIRE_PUZZLE_STATUS.REROUTED ||
        this.status === WIRE_PUZZLE_STATUS.SAFE_WINDOW ||
        this.voltageLevel > 0 ||
        this.stability > 0)
    );
  }

  stopTicker() {
    if (!this.timerId) {
      return;
    }

    clearInterval(this.timerId);
    this.timerId = null;
  }

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

function createRound(wireCount) {
  const selectedWires = shuffleArray([...WIRE_LIBRARY]).slice(0, wireCount);
  const targetIndex = randomInt(0, selectedWires.length - 1);
  const falsePositiveIndex = getFalsePositiveIndex(selectedWires.length, targetIndex);

  const wires = selectedWires.map((wire, index) => ({
    id: "wire-" + (index + 1),
    colorName: wire.colorName,
    hex: wire.hex,
    spikeLevel:
      index === targetIndex
        ? randomInt(87, 98)
        : index === falsePositiveIndex
          ? randomInt(58, 73)
          : randomInt(16, 48),
    testCount: 0,
    isCut: false,
    lastTestedAt: null,
  }));

  return {
    wires,
    targetWireId: wires[targetIndex].id,
  };
}

function getFalsePositiveIndex(length, targetIndex) {
  if (length <= 1) {
    return targetIndex;
  }

  let index = randomInt(0, length - 1);

  while (index === targetIndex) {
    index = randomInt(0, length - 1);
  }

  return index;
}

function getStatusLabel(status) {
  if (status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "Rerouted";
  }

  if (status === WIRE_PUZZLE_STATUS.SAFE_WINDOW) {
    return "Safe Window";
  }

  if (status === WIRE_PUZZLE_STATUS.SOLVED) {
    return "Secured";
  }

  return "Diagnosing";
}

function getVoltageBand(level) {
  if (level >= 75) {
    return "Critical";
  }

  if (level >= 45) {
    return "Elevated";
  }

  if (level >= 15) {
    return "Low";
  }

  return "Idle";
}

function shuffleArray(array) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    const current = array[index];
    array[index] = array[swapIndex];
    array[swapIndex] = current;
  }

  return array;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createId() {
  return Math.random().toString(36).slice(2);
}

export {
  DEFAULT_WIRE_PUZZLE_CONFIG,
  ROLE_IDS,
  WIRE_PUZZLE_EVENTS,
  WIRE_PUZZLE_STATUS,
  WirePuzzleSystem,
};
