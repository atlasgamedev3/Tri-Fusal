// Visual bomb overlay for Tri-Fusal.
// It listens to BombSystem events and updates the timer, puzzle progress, and win/fail screens.

import { BOMB_EVENTS, BOMB_STATUS } from "../game/bombSystem.js";

function createBombOverlay(bombSystem, options = {}) {
  const root = options.root ?? document.body;
  const puzzleLabels = options.puzzleLabels ?? {};

  // This section is the main game shell: top bomb HUD, puzzle stage, and result overlay.
  const element = document.createElement("section");
  element.className = "bomb-screen";
  element.innerHTML = [
    "<div class=\"bomb-backdrop\" aria-hidden=\"true\">",
    "  <div class=\"bomb-shadow\"></div>",
    "  <div class=\"bomb-wire wire-red\"></div>",
    "  <div class=\"bomb-wire wire-yellow\"></div>",
    "  <div class=\"bomb-wire wire-blue\"></div>",
    "</div>",
    "<header class=\"bomb-hud\" aria-label=\"Bomb status\">",
    "  <div class=\"dynamite-display\" aria-hidden=\"true\">",
    "    <div class=\"dynamite-stick stick-one\"></div>",
    "    <div class=\"dynamite-stick stick-two\"></div>",
    "    <div class=\"dynamite-stick stick-three\"></div>",
    "    <div class=\"dynamite-band\"></div>",
    "    <div class=\"dynamite-fuse\"></div>",
    "  </div>",
    "  <div class=\"timer-panel\">",
    "    <span class=\"timer-label\">Bomb Timer</span>",
    "    <strong class=\"timer-value\" data-bomb-time>15:00</strong>",
    "  </div>",
    "  <div class=\"progress-panel\">",
    "    <span class=\"progress-label\" data-bomb-status>Ready</span>",
    "    <strong class=\"progress-value\" data-puzzle-progress>0 / 2 puzzles</strong>",
    "  </div>",
    "</header>",
    "<main class=\"puzzle-layout\">",
    "  <aside class=\"puzzle-checklist\" aria-label=\"Puzzle progress\">",
    "    <h2>Puzzle Modules</h2>",
    "    <div class=\"puzzle-list\" data-puzzle-list></div>",
    "  </aside>",
    "  <section class=\"puzzle-stage\" data-puzzle-stage aria-label=\"Active puzzle board\"></section>",
    "</main>",
    "<div class=\"bomb-blackout\" aria-hidden=\"true\"></div>",
    "<section class=\"bomb-outcome\" data-bomb-outcome role=\"status\" aria-live=\"assertive\"></section>",
  ].join("");

  root.appendChild(element);

  // Keep DOM references together so updateScreen() can stay readable.
  const refs = {
    time: element.querySelector("[data-bomb-time]"),
    status: element.querySelector("[data-bomb-status]"),
    progress: element.querySelector("[data-puzzle-progress]"),
    puzzleList: element.querySelector("[data-puzzle-list]"),
    puzzleStage: element.querySelector("[data-puzzle-stage]"),
    outcome: element.querySelector("[data-bomb-outcome]"),
  };

  renderPuzzleList(refs.puzzleList, bombSystem.getState(), puzzleLabels);

  // Every bomb event that can change the screen points to the same renderer.
  const unsubscribers = [
    bombSystem.on(BOMB_EVENTS.STARTED, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.TICK, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.PUZZLE_COMPLETED, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.PUZZLE_RESET, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.DEFUSED, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.DETONATED, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.RESET, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
    bombSystem.on(BOMB_EVENTS.STOPPED, ({ state }) => updateScreen(element, refs, state, puzzleLabels)),
  ];

  updateScreen(element, refs, bombSystem.getState(), puzzleLabels);

  return {
    element,
    puzzleStage: refs.puzzleStage,

    // Allows game setup code to place the current puzzle board inside the bomb shell.
    setPuzzleContent(content) {
      refs.puzzleStage.replaceChildren();

      if (typeof content === "string") {
        refs.puzzleStage.innerHTML = content;
        return;
      }

      if (Array.isArray(content)) {
        refs.puzzleStage.append(...content);
        return;
      }

      if (content) {
        refs.puzzleStage.append(content);
      }
    },

    // Manual refresh hook for rare cases where external code changes labels or state.
    update() {
      updateScreen(element, refs, bombSystem.getState(), puzzleLabels);
    },

    // Removes the overlay and unregisters event listeners.
    destroy() {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }

      element.remove();
    },
  };
}

function updateScreen(element, refs, state, puzzleLabels) {
  refs.time.textContent = state.formattedTime;
  refs.status.textContent = getStatusText(state.status);
  refs.progress.textContent = state.solvedCount + " / " + state.requiredPuzzleCount + " puzzles";

  element.dataset.bombStatus = state.status;
  element.classList.toggle("is-running", state.status === BOMB_STATUS.RUNNING);
  element.classList.toggle("is-defused", state.status === BOMB_STATUS.DEFUSED);
  element.classList.toggle("is-detonated", state.status === BOMB_STATUS.DETONATED);

  renderPuzzleList(refs.puzzleList, state, puzzleLabels);
  renderOutcome(refs.outcome, state);
}

function renderPuzzleList(container, state, puzzleLabels) {
  container.replaceChildren(
    ...state.puzzles.map((puzzle) => {
      const row = document.createElement("div");
      row.className = "puzzle-row";
      row.dataset.solved = String(puzzle.isSolved);

      const marker = document.createElement("span");
      marker.className = "puzzle-marker";
      marker.textContent = puzzle.isSolved ? "OK" : "";

      const label = document.createElement("span");
      label.className = "puzzle-name";
      label.textContent = puzzleLabels[puzzle.id] ?? puzzle.id;

      row.append(marker, label);
      return row;
    }),
  );
}

function renderOutcome(container, state) {
  if (state.status === BOMB_STATUS.DEFUSED) {
    container.innerHTML = [
      "<div class=\"outcome-card success\">",
      "  <span class=\"outcome-kicker\">Bomb Defused</span>",
      "  <strong>Mission complete</strong>",
      "</div>",
    ].join("");
    return;
  }

  if (state.status === BOMB_STATUS.DETONATED) {
    container.innerHTML = [
      "<div class=\"outcome-card failure\">",
      "  <span class=\"outcome-kicker\">Detonation</span>",
      "  <strong>Better luck next time...</strong>",
      "</div>",
    ].join("");
    return;
  }

  container.replaceChildren();
}

function getStatusText(status) {
  if (status === BOMB_STATUS.RUNNING) {
    return "Active";
  }

  if (status === BOMB_STATUS.DEFUSED) {
    return "Defused";
  }

  if (status === BOMB_STATUS.DETONATED) {
    return "Detonated";
  }

  return "Ready";
}

export { createBombOverlay };
