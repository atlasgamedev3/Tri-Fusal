import soundManager, { SOUND_KEYS } from "./audio/soundManager.js";
import { BOMB_EVENTS, BOMB_STATUS, BombSystem, TWO_PUZZLE_BOMB_CONFIG } from "./game/bombSystem.js";
import { TIMING_PUZZLE_EVENTS, TimingPuzzleSystem } from "./game/timingPuzzleSystem.js";
import { WIRE_PUZZLE_EVENTS, WirePuzzleSystem } from "./game/wirePuzzleSystem.js";
import { createBombOverlay } from "./ui/bombOverlay.js";
import { createTimingPuzzleBoard } from "./ui/timingPuzzleBoard.js";
import { createWirePuzzleBoard } from "./ui/wirePuzzleBoard.js";

const puzzleLabels = {
  "puzzle-1": "Fusebreak Relay",
  "puzzle-2": "Chronolock Array",
};

const appRoot = document.querySelector("#app");
const bombSystem = new BombSystem(TWO_PUZZLE_BOMB_CONFIG);
const wirePuzzle = new WirePuzzleSystem();
const timingPuzzle = new TimingPuzzleSystem();
let activePuzzleId = "puzzle-1";
let activeRoleLabels = {
  "puzzle-1": "Player 1 - Wire Panel",
  "puzzle-2": "Player 1 - Skill Check",
};
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
  onRoleChange: (roleLabel) => {
    activeRoleLabels["puzzle-1"] = roleLabel;
    if (activePuzzleId === "puzzle-1") syncOverlayStatus();
  },
});

const timingPuzzleBoard = createTimingPuzzleBoard({
  bombSystem,
  timingPuzzle,
  onStartRound: startRound,
  onResetRound: resetRound,
  onTestDetonation: triggerDetonation,
  onRoleChange: (roleLabel) => {
    activeRoleLabels["puzzle-2"] = roleLabel;
    if (activePuzzleId === "puzzle-2") syncOverlayStatus();
  },
});

const moduleSwitcher = createModuleSwitcher();
bombOverlay.setPuzzleContent(moduleSwitcher);
wireBombEvents();
wirePuzzleEvents();
timingPuzzleEvents();
showPuzzle("puzzle-1");

function startRound() {
  const bombState = bombSystem.getState();

  soundManager.unlock();

  if (bombState.status === BOMB_STATUS.DEFUSED || bombState.status === BOMB_STATUS.DETONATED) {
    wirePuzzle.reset();
    timingPuzzle.reset();
  }

  bombSystem.start();
  updateModuleSwitcherState();
}

function resetRound() {
  bombSystem.reset();
  updateModuleSwitcherState();
}

function solvePuzzle(puzzleId) {
  soundManager.queueSoundEffect(SOUND_KEYS.MODULE_SOLVED);
  bombSystem.completePuzzle(puzzleId);
  updateModuleSwitcherState();
}

function triggerDetonation() {
  soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
  bombSystem.detonate();
}

function wireBombEvents() {
  bombSystem.on(BOMB_EVENTS.STARTED, () => {
    wirePuzzle.arm();
    timingPuzzle.arm();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.RESET, () => {
    wirePuzzle.reset();
    timingPuzzle.reset();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.STOPPED, () => {
    wirePuzzle.disarm();
    timingPuzzle.disarm();
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.DEFUSED, () => {
    wirePuzzle.disarm();
    timingPuzzle.disarm();
    soundManager.queueSoundEffect(SOUND_KEYS.DEFUSE_SUCCESS);
    syncOverlayStatus();
  });

  bombSystem.on(BOMB_EVENTS.DETONATED, () => {
    wirePuzzle.disarm();
    timingPuzzle.disarm();
    soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
    syncOverlayStatus();
  });
}

function timingPuzzleEvents() {
  timingPuzzle.on(TIMING_PUZZLE_EVENTS.SOLVED, () => {
    solvePuzzle("puzzle-2");
    syncOverlayStatus();
  });

  timingPuzzle.on(TIMING_PUZZLE_EVENTS.STRIKE, (event) => {
    soundManager.queueSoundEffect(SOUND_KEYS.MODULE_FAILED);
    const penaltyMs = event.detail.reason === "skillMiss" ? 5000 : 30000;
    bombSystem.applyTimePenalty(penaltyMs);
    syncOverlayStatus();
  });

  timingPuzzle.on(TIMING_PUZZLE_EVENTS.SECTION_COMPLETED, () => {
    soundManager.queueSoundEffect(SOUND_KEYS.BUTTON_PRESS);
    syncOverlayStatus();
  });

  timingPuzzle.on(TIMING_PUZZLE_EVENTS.ARMED, syncOverlayStatus);
  timingPuzzle.on(TIMING_PUZZLE_EVENTS.DISARMED, syncOverlayStatus);
  timingPuzzle.on(TIMING_PUZZLE_EVENTS.RESET, syncOverlayStatus);
  timingPuzzle.on(TIMING_PUZZLE_EVENTS.UPDATED, syncOverlayStatus);
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
  if (activePuzzleId === "puzzle-2") {
    const timingState = timingPuzzle.getState();
    bombOverlay.setStatusDetails({
      safeWindowLabel: timingState.completedCount + "/3",
      safeWindowTone: timingState.lastStrike ? "danger" : timingState.completedCount > 0 ? "charging" : "idle",
      moduleStateLabel: timingState.statusLabel,
      activeRoleLabel: activeRoleLabels["puzzle-2"],
      ...overrides,
    });
    return;
  }

  const puzzleState = wirePuzzle.getState();

  bombOverlay.setStatusDetails({
    safeWindowLabel: getSafeWindowLabel(puzzleState),
    safeWindowTone: getSafeWindowTone(puzzleState),
    moduleStateLabel: puzzleState.statusLabel,
    activeRoleLabel: activeRoleLabels["puzzle-1"],
    ...overrides,
  });
}

function createModuleSwitcher() {
  const wrapper = document.createElement("section");
  wrapper.className = "module-workspace";
  wrapper.innerHTML = [
    "<nav class=\"module-switcher\" aria-label=\"Bomb modules\">",
    "  <button class=\"module-switch-button\" type=\"button\" data-module-id=\"puzzle-1\"><span>Module 01</span><strong>Fusebreak Relay</strong></button>",
    "  <button class=\"module-switch-button\" type=\"button\" data-module-id=\"puzzle-2\"><span>Module 02</span><strong>Chronolock Array</strong></button>",
    "</nav>",
    "<div class=\"module-board-slot\"></div>",
  ].join("");
  wrapper.addEventListener("click", (event) => {
    const button = event.target.closest("[data-module-id]");
    if (button) showPuzzle(button.dataset.moduleId);
  });
  return wrapper;
}

function showPuzzle(puzzleId) {
  activePuzzleId = puzzleId === "puzzle-2" ? "puzzle-2" : "puzzle-1";
  const board = activePuzzleId === "puzzle-2" ? timingPuzzleBoard : wirePuzzleBoard;
  const slot = moduleSwitcher.querySelector(".module-board-slot");
  slot.replaceChildren(board.element);
  timingPuzzleBoard.setActive(activePuzzleId === "puzzle-2");

  for (const button of moduleSwitcher.querySelectorAll("[data-module-id]")) {
    const isSelected = button.dataset.moduleId === activePuzzleId;
    button.dataset.active = String(isSelected);
    button.setAttribute("aria-current", isSelected ? "page" : "false");
  }

  updateModuleSwitcherState();
  syncOverlayStatus();
}

function updateModuleSwitcherState() {
  const bombState = bombSystem.getState();
  for (const button of moduleSwitcher.querySelectorAll("[data-module-id]")) {
    button.dataset.complete = String(bombState.completedPuzzleIds.includes(button.dataset.moduleId));
  }
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
