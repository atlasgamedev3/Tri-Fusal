// Small prototype wiring for the 15-minute, two-puzzle bomb round.
// Later, real puzzle boards can replace these placeholder cards and still use the same BombSystem.

import soundManager, { SOUND_KEYS } from "./audio/soundManager.js";
import { BOMB_EVENTS, BOMB_STATUS, BombSystem, TWO_PUZZLE_BOMB_CONFIG } from "./game/bombSystem.js";
import { createBombOverlay } from "./ui/bombOverlay.js";

const puzzleLabels = {
  "puzzle-1": "Puzzle One",
  "puzzle-2": "Puzzle Two",
};

const appRoot = document.querySelector("#app");
const bombSystem = new BombSystem(TWO_PUZZLE_BOMB_CONFIG);
const bombOverlay = createBombOverlay(bombSystem, {
  root: appRoot,
  puzzleLabels,
});

bombOverlay.setPuzzleContent(createDemoBoard());
wireBombEvents();
syncDemoButtons();

function createDemoBoard() {
  const board = document.createElement("div");
  board.className = "demo-board";
  board.innerHTML = [
    "<div class=\"demo-board-header\">",
    "  <h1>Bomb Defusal Board</h1>",
    "  <div class=\"demo-actions\">",
    "    <button class=\"command-button\" type=\"button\" data-start-round>Start Round</button>",
    "    <button class=\"command-button secondary\" type=\"button\" data-reset-round>Reset</button>",
    "    <button class=\"command-button secondary\" type=\"button\" data-test-detonation>Test Detonation</button>",
    "  </div>",
    "</div>",
    "<div class=\"demo-puzzles\">",
    createPuzzleCard("puzzle-1", "Signal Locks", "Placeholder for the first puzzle board."),
    createPuzzleCard("puzzle-2", "Wire Sequence", "Placeholder for the second puzzle board."),
    "</div>",
  ].join("");

  board.addEventListener("click", handleDemoClick);

  return board;
}

function createPuzzleCard(puzzleId, title, body) {
  return [
    "<article class=\"demo-puzzle\" data-puzzle-card=\"" + puzzleId + "\">",
    "  <h2>" + title + "</h2>",
    "  <p>" + body + "</p>",
    "  <button class=\"solve-button\" type=\"button\" data-solve-puzzle=\"" + puzzleId + "\">Mark Solved</button>",
    "</article>",
  ].join("");
}

function handleDemoClick(event) {
  const startButton = event.target.closest("[data-start-round]");
  const resetButton = event.target.closest("[data-reset-round]");
  const detonationButton = event.target.closest("[data-test-detonation]");
  const solveButton = event.target.closest("[data-solve-puzzle]");

  if (startButton) {
    startRound();
    return;
  }

  if (resetButton) {
    resetRound();
    return;
  }

  if (detonationButton) {
    triggerDetonation();
    return;
  }

  if (solveButton) {
    solvePuzzle(solveButton.dataset.solvePuzzle);
  }
}

function startRound() {
  // Browser audio needs a player gesture before sounds can play, so Start unlocks the sound manager.
  soundManager.unlock();
  bombSystem.start();
  syncDemoButtons();
}

function resetRound() {
  bombSystem.reset();
  syncDemoButtons();
}

function solvePuzzle(puzzleId) {
  soundManager.queueSoundEffect(SOUND_KEYS.MODULE_SOLVED);
  bombSystem.completePuzzle(puzzleId);
  syncDemoButtons();
}

function triggerDetonation() {
  soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
  bombSystem.detonate();
  syncDemoButtons();
}

function wireBombEvents() {
  bombSystem.on(BOMB_EVENTS.STARTED, syncDemoButtons);
  bombSystem.on(BOMB_EVENTS.PUZZLE_COMPLETED, syncDemoButtons);
  bombSystem.on(BOMB_EVENTS.RESET, syncDemoButtons);
  bombSystem.on(BOMB_EVENTS.DEFUSED, () => {
    soundManager.queueSoundEffect(SOUND_KEYS.DEFUSE_SUCCESS);
    syncDemoButtons();
  });
  bombSystem.on(BOMB_EVENTS.DETONATED, () => {
    soundManager.queueSoundEffect(SOUND_KEYS.DETONATION);
    syncDemoButtons();
  });
}

function syncDemoButtons() {
  const state = bombSystem.getState();
  const isRunning = state.status === BOMB_STATUS.RUNNING;
  const isFinished = state.status === BOMB_STATUS.DEFUSED || state.status === BOMB_STATUS.DETONATED;

  const startButton = document.querySelector("[data-start-round]");
  const detonationButton = document.querySelector("[data-test-detonation]");

  if (startButton) {
    startButton.disabled = isRunning;
  }

  if (detonationButton) {
    detonationButton.disabled = isFinished;
  }

  for (const puzzle of state.puzzles) {
    const solveButton = document.querySelector("[data-solve-puzzle=\"" + puzzle.id + "\"]");
    const puzzleCard = document.querySelector("[data-puzzle-card=\"" + puzzle.id + "\"]");

    if (solveButton) {
      solveButton.disabled = !isRunning || puzzle.isSolved || isFinished;
      solveButton.textContent = puzzle.isSolved ? "Solved" : "Mark Solved";
    }

    if (puzzleCard) {
      puzzleCard.dataset.solved = String(puzzle.isSolved);
    }
  }
}
