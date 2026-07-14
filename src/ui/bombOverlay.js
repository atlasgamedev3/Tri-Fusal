// Shared bomb shell for the lightweight local Tri-Fusal prototype.
// It renders the top HUD, keeps the active puzzle board mounted below it, and shows win/fail overlays.

import { BOMB_EVENTS, BOMB_STATUS } from "../game/bombSystem.js";

function createBombOverlay(bombSystem, options = {}) {
  const root = options.root ?? document.body;
  const puzzleLabels = options.puzzleLabels ?? {};
  const details = {
    safeWindowLabel: "Locked",
    safeWindowTone: "idle",
    moduleStateLabel: "Standby",
    activeRoleLabel: "Local POV",
  };

  const element = document.createElement("section");
  element.className = "bomb-screen";
  element.addEventListener("click", handleClick);
  element.innerHTML = [
    "<div class=\"bomb-backdrop\" aria-hidden=\"true\">",
    "  <div class=\"backdrop-grid\"></div>",
    "  <div class=\"backdrop-vignette\"></div>",
    "  <div class=\"backdrop-rivets rivets-top\"></div>",
    "  <div class=\"backdrop-rivets rivets-bottom\"></div>",
    "</div>",
    "<header class=\"bomb-hud\" aria-label=\"Bomb status\">",
    "  <section class=\"hud-module hud-brand-panel\">",
    "    <div class=\"hud-brand-mark\" aria-hidden=\"true\">TF</div>",
    "    <div class=\"hud-brand-copy\">",
    "      <strong class=\"hud-title\">Tri-Fusal</strong>",
    "      <span class=\"hud-subtitle\">Cooperative Defusal Protocol</span>",
    "    </div>",
    "  </section>",
    "  <section class=\"hud-module hud-timer-panel\">",
    "    <span class=\"hud-label\">Time Remaining</span>",
    "    <strong class=\"timer-value\" data-bomb-time>15:00</strong>",
    "    <span class=\"hud-status-text\" data-bomb-status>Standby</span>",
    "  </section>",
    "  <section class=\"hud-module hud-progress-panel\">",
    "    <span class=\"hud-label\">Module Progress</span>",
    "    <div class=\"puzzle-list\" data-puzzle-list></div>",
    "  </section>",
    "  <section class=\"hud-module hud-alert-panel\">",
    "    <div class=\"hud-alert-grid\">",
    "      <div class=\"hud-alert-cell\">",
    "        <span class=\"hud-label danger\">Strikes</span>",
    "        <div class=\"strike-list\" data-strike-list></div>",
    "      </div>",
    "      <div class=\"hud-alert-cell\">",
    "        <span class=\"hud-label\">Safe Window</span>",
    "        <strong class=\"hud-indicator\" data-safe-window>Locked</strong>",
    "      </div>",
    "      <div class=\"hud-alert-cell\">",
    "        <span class=\"hud-label\">Module State</span>",
    "        <strong class=\"hud-indicator\" data-module-state>Standby</strong>",
    "      </div>",
    "      <div class=\"hud-alert-cell\">",
    "        <span class=\"hud-label\">Local Focus</span>",
    "        <strong class=\"hud-indicator\" data-active-role>Player 1</strong>",
    "      </div>",
    "    </div>",
    "  </section>",
    "</header>",
    "<main class=\"puzzle-layout\">",
    "  <section class=\"puzzle-stage\" data-puzzle-stage aria-label=\"Active puzzle board\"></section>",
    "</main>",
    "<div class=\"bomb-blackout\" aria-hidden=\"true\"></div>",
    "<section class=\"bomb-outcome\" data-bomb-outcome role=\"status\" aria-live=\"assertive\"></section>",
  ].join("");

  root.appendChild(element);

  const refs = {
    time: element.querySelector("[data-bomb-time]"),
    status: element.querySelector("[data-bomb-status]"),
    puzzleList: element.querySelector("[data-puzzle-list]"),
    strikeList: element.querySelector("[data-strike-list]"),
    safeWindow: element.querySelector("[data-safe-window]"),
    moduleState: element.querySelector("[data-module-state]"),
    activeRole: element.querySelector("[data-active-role]"),
    puzzleStage: element.querySelector("[data-puzzle-stage]"),
    outcome: element.querySelector("[data-bomb-outcome]"),
  };

  const render = (state = bombSystem.getState()) => {
    refs.time.textContent = state.formattedTime;
    refs.status.textContent = getStatusText(state.status);
    refs.safeWindow.textContent = details.safeWindowLabel;
    refs.moduleState.textContent = details.moduleStateLabel;
    refs.activeRole.textContent = details.activeRoleLabel;

    element.dataset.bombStatus = state.status;
    element.dataset.safeTone = details.safeWindowTone;
    element.dataset.timeCritical = String(state.remainingMs <= 60000);
    element.classList.toggle("is-running", state.status === BOMB_STATUS.RUNNING);
    element.classList.toggle("is-defused", state.status === BOMB_STATUS.DEFUSED);
    element.classList.toggle("is-detonated", state.status === BOMB_STATUS.DETONATED);
    element.classList.toggle("is-danger", state.status === BOMB_STATUS.DETONATED || details.safeWindowTone === "danger");

    renderPuzzleList(refs.puzzleList, state, puzzleLabels);
    renderStrikeList(refs.strikeList, state);
    renderOutcome(refs.outcome, state);
  };

  const unsubscribers = [
    bombSystem.on(BOMB_EVENTS.STARTED, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.TICK, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.TIME_PENALIZED, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.PUZZLE_COMPLETED, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.PUZZLE_RESET, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.DEFUSED, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.DETONATED, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.RESET, ({ state }) => render(state)),
    bombSystem.on(BOMB_EVENTS.STOPPED, ({ state }) => render(state)),
  ];

  render();

  return {
    element,
    puzzleStage: refs.puzzleStage,

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

    setStatusDetails(nextDetails = {}) {
      details.safeWindowLabel = nextDetails.safeWindowLabel ?? details.safeWindowLabel;
      details.safeWindowTone = nextDetails.safeWindowTone ?? details.safeWindowTone;
      details.moduleStateLabel = nextDetails.moduleStateLabel ?? details.moduleStateLabel;
      details.activeRoleLabel = nextDetails.activeRoleLabel ?? details.activeRoleLabel;
      render();
    },

    update() {
      render();
    },

    destroy() {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }

      element.removeEventListener("click", handleClick);
      element.remove();
    },
  };

  function handleClick(event) {
    const resetButton = event.target.closest("[data-outcome-reset]");

    if (resetButton) {
      options.onOutcomeReset?.();
    }
  }
}

function renderPuzzleList(container, state, puzzleLabels) {
  container.replaceChildren(
    ...state.puzzles.map((puzzle, index) => {
      const item = document.createElement("div");
      item.className = "hud-progress-node";
      item.dataset.solved = String(puzzle.isSolved);

      const lamp = document.createElement("span");
      lamp.className = "hud-progress-lamp";

      const label = document.createElement("span");
      label.className = "hud-progress-label";
      label.textContent = String(index + 1);
      label.setAttribute("aria-label", puzzleLabels[puzzle.id] ?? puzzle.id);

      item.append(lamp, label);
      return item;
    }),
  );
}

function renderStrikeList(container, state) {
  container.replaceChildren(
    ...Array.from({ length: state.maxStrikes }, (_, index) => {
      const skull = document.createElement("span");
      skull.className = "strike-skull";
      skull.dataset.active = String(index < state.strikeCount);
      skull.textContent = "skull";
      return skull;
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
      "  <strong>Station compromised</strong>",
      "  <button class=\"service-button primary outcome-action\" type=\"button\" data-outcome-reset>Reset Round</button>",
      "</div>",
    ].join("");
    return;
  }

  container.replaceChildren();
}

function getStatusText(status) {
  if (status === BOMB_STATUS.RUNNING) {
    return "Live";
  }

  if (status === BOMB_STATUS.DEFUSED) {
    return "Defused";
  }

  if (status === BOMB_STATUS.DETONATED) {
    return "Detonated";
  }

  return "Standby";
}

export { createBombOverlay };
