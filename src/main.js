import soundManager, { SOUND_KEYS } from "./audio/soundManager.js";
import { BOMB_EVENTS, BOMB_STATUS, BombSystem, SINGLE_PUZZLE_BOMB_CONFIG } from "./game/bombSystem.js";
import { WIRE_PUZZLE_EVENTS, WirePuzzleSystem } from "./game/wirePuzzleSystem.js";
import { createBombOverlay } from "./ui/bombOverlay.js";
import { createWirePuzzleBoard } from "./ui/wirePuzzleBoard.js";

const puzzleLabels = {
  "puzzle-1": "Fusebreak Relay",
};

const appRoot = document.querySelector("#app");
const bombSystem = new BombSystem(SINGLE_PUZZLE_BOMB_CONFIG);
const wirePuzzle = new WirePuzzleSystem();
const bombOverlay = createBombOverlay(bombSystem, {
  root: appRoot,
  puzzleLabels,
  onOutcomeReset: resetRound,
});

const wirePuzzleBoard = createWirePuzzleBoard({
  bombSystem,
  wirePuzzle,
  onStartRound: startRound,
  onResetRound: resetRound,
  onTestDetonation: triggerDetonation,
  onRoleChange: (roleLabel) => syncOverlayStatus({ activeRoleLabel: roleLabel }),
});

bombOverlay.setPuzzleContent(wirePuzzleBoard.element);
wireBombEvents();
wirePuzzleEvents();
syncOverlayStatus({ activeRoleLabel: "Player 1 - Wire Panel" });

function startRound() {
  const bombState = bombSystem.getState();

  soundManager.unlock();

  if (bombState.status === BOMB_STATUS.DEFUSED || bombState.status === BOMB_STATUS.DETONATED) {
    wirePuzzle.reset();
  }

  bombSystem.start();
}

function resetRound() {
  bombSystem.reset();
}

function solvePuzzle(puzzleId) {
  soundManager.queueSoundEffect(SOUND_KEYS.MODULE_SOLVED);
  bombSystem.completePuzzle(puzzleId);
}

function triggerDetonation() {
  soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
  bombSystem.detonate();
}

function wireBombEvents() {
  bombSystem.on(BOMB_EVENTS.STARTED, () => {
    wirePuzzle.arm();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.RESET, () => {
    wirePuzzle.reset();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.STOPPED, () => {
    wirePuzzle.disarm();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.DEFUSED, () => {
    wirePuzzle.disarm();
    soundManager.queueSoundEffect(SOUND_KEYS.DEFUSE_SUCCESS);
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.DETONATED, () => {
    wirePuzzle.disarm();
    soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
    syncOverlayStatus();
  });
}

function wirePuzzleEvents() {
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.SOLVED, () => {
    solvePuzzle("puzzle-1");
    syncOverlayStatus();
  });

  wirePuzzle.on(WIRE_PUZZLE_EVENTS.STRIKE, () => {
    soundManager.queueSoundEffect(SOUND_KEYS.MODULE_FAILED);
    bombSystem.applyTimePenalty(Math.ceil(bombSystem.durationMs / 3));
    syncOverlayStatus();
  });

  wirePuzzle.on(WIRE_PUZZLE_EVENTS.ARMED, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.DISARMED, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.RESET, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.UPDATED, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.TESTED, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.REROUTED, syncOverlayStatus);
  wirePuzzle.on(WIRE_PUZZLE_EVENTS.SAFE_WINDOW_OPENED, syncOverlayStatus);
}

function syncOverlayStatus(overrides = {}) {
  const puzzleState = wirePuzzle.getState();

  bombOverlay.setStatusDetails({
    safeWindowLabel: getSafeWindowLabel(puzzleState),
    safeWindowTone: getSafeWindowTone(puzzleState),
    moduleStateLabel: puzzleState.statusLabel,
    ...overrides,
  });
}

function getSafeWindowLabel(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return formatTenths(puzzleState.safeWindowRemainingMs);
  }

  if (puzzleState.lastStrike) {
    return "Fault";
  }

  if (puzzleState.status === "rerouted") {
    return "Charging";
  }

  if (puzzleState.status === "solved") {
    return "Secured";
  }

  return "Locked";
}

function getSafeWindowTone(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return "safe";
  }

  if (puzzleState.lastStrike) {
    return "danger";
  }

  if (puzzleState.status === "rerouted") {
    return "charging";
  }

  return "idle";
}

function formatTenths(milliseconds) {
  const clamped = Math.max(0, milliseconds);
  const seconds = Math.floor(clamped / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");

  return minutes + ":" + remainingSeconds + "." + tenths;
}
