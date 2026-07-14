import { BOMB_EVENTS, BOMB_STATUS } from "../game/bombSystem.js";
import { TIMING_PUZZLE_EVENTS, TIMING_ROLE_IDS } from "../game/timingPuzzleSystem.js";

const GUIDE_TAB_ID = "timing-guide";
const ROLE_TABS = Object.freeze([
  { id: TIMING_ROLE_IDS.PLAYER_ONE, label: "Player 1", title: "Skill Check" },
  { id: TIMING_ROLE_IDS.PLAYER_TWO, label: "Player 2", title: "Reflex Gate" },
  { id: TIMING_ROLE_IDS.PLAYER_THREE, label: "Player 3", title: "Balance" },
  { id: GUIDE_TAB_ID, label: "Game Guide", title: "How To Play" },
]);

function createTimingPuzzleBoard(options) {
  const bombSystem = options.bombSystem;
  const timingPuzzle = options.timingPuzzle;
  let activeRole = TIMING_ROLE_IDS.PLAYER_ONE;
  let isActive = false;
  let flashTimeoutId = null;

  const element = document.createElement("section");
  element.className = "wire-puzzle-board timing-puzzle-board";
  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("click", handleClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  const render = () => {
    const bombState = bombSystem.getState();
    const state = timingPuzzle.getState();
    const isRoundRunning = bombState.status === BOMB_STATUS.RUNNING;
    const isBombFinished = bombState.status === BOMB_STATUS.DEFUSED || bombState.status === BOMB_STATUS.DETONATED;
    const isModuleSolved = bombState.completedPuzzleIds.includes("puzzle-2");

    element.dataset.focusRole = activeRole;
    element.dataset.moduleStatus = state.status;
    element.innerHTML = [
      "<div class=\"station-shell\">",
      "  <div class=\"role-tab-row station-tabs\" role=\"tablist\" aria-label=\"Switch local player point of view\">",
      renderRoleTabs(activeRole, state),
      "  </div>",
      "  <div class=\"station-service-row\">",
      "    <div class=\"station-instruction-plate\">",
      "      <span class=\"service-kicker\">" + escapeHtml(getRoleName(activeRole)) + "</span>",
      "      <p>" + escapeHtml(getInstruction(activeRole, state)) + "</p>",
      "    </div>",
      "    <div class=\"service-readouts\">",
      "      <span class=\"service-tag\">Channels: " + state.completedCount + "/3</span>",
      "      <span class=\"service-tag\">Input: Spacebar</span>",
      "    </div>",
      "    <div class=\"service-controls\">",
      "      <button class=\"service-button primary\" type=\"button\" data-start-round " + disabledAttr(isRoundRunning) + ">Arm</button>",
      "      <button class=\"service-button\" type=\"button\" data-reset-round>Reset</button>",
      "      <button class=\"service-button danger\" type=\"button\" data-test-detonation " + disabledAttr(isBombFinished) + ">Detonate</button>",
      "    </div>",
      "  </div>",
      "  <div class=\"station-grid timing-station-grid\" data-page=\"" + activeRole + "\">",
      "    <section class=\"station-main-column station-page\">",
      renderActivePage(activeRole, state, isRoundRunning, isModuleSolved),
      "    </section>",
      "    <aside class=\"station-side-column station-support-column\">",
      renderSupportColumn(state, activeRole),
      "    </aside>",
      "  </div>",
      "</div>",
    ].join("");

    if (isActive) {
      options.onRoleChange?.(getRoleHudLabel(activeRole));
    }
  };

  const unsubscribers = [
    ...Object.values(BOMB_EVENTS).map((eventName) => bombSystem.on(eventName, render)),
    ...Object.values(TIMING_PUZZLE_EVENTS).map((eventName) =>
      timingPuzzle.on(eventName, () => {
        if (eventName === TIMING_PUZZLE_EVENTS.STRIKE) triggerTransientClass("flash-danger");
        if (eventName === TIMING_PUZZLE_EVENTS.SECTION_COMPLETED) triggerTransientClass("flash-ready");
        if (eventName === TIMING_PUZZLE_EVENTS.SOLVED) triggerTransientClass("flash-success");
        render();
      }),
    ),
  ];

  render();

  return {
    element,
    setActive(nextActive) {
      isActive = Boolean(nextActive);
      if (isActive) render();
    },
    getRoleLabel() {
      return getRoleHudLabel(activeRole);
    },
    destroy() {
      clearTimeout(flashTimeoutId);
      for (const unsubscribe of unsubscribers) unsubscribe();
      element.removeEventListener("click", handleClick);
      element.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleDocumentKeydown);
      element.remove();
    },
  };

  function handleClick(event) {
    const roleButton = event.target.closest("[data-role-tab]");
    if (roleButton) {
      return;
    }

    if (event.target.closest("[data-start-round]")) return options.onStartRound?.();
    if (event.target.closest("[data-reset-round]")) return options.onResetRound?.();
    if (event.target.closest("[data-test-detonation]")) return options.onTestDetonation?.();
    if (event.target.closest("[data-timing-action]")) handleSpaceAction();
  }

  function handlePointerDown(event) {
    const roleButton = event.target.closest("[data-role-tab]");
    if (!roleButton) return;
    event.preventDefault();
    activeRole = roleButton.dataset.roleTab;
    render();
  }

  function handleDocumentKeydown(event) {
    if (!isActive || event.code !== "Space" || event.repeat || isEditableTarget(event.target)) return;
    event.preventDefault();
    handleSpaceAction();
  }

  function handleSpaceAction() {
    if (activeRole === GUIDE_TAB_ID) return;
    if (activeRole === TIMING_ROLE_IDS.PLAYER_TWO) timingPuzzle.pressReaction();
    else if (activeRole === TIMING_ROLE_IDS.PLAYER_THREE) timingPuzzle.pressBalance();
    else timingPuzzle.pressSkillCheck();
  }

  function triggerTransientClass(className) {
    clearTimeout(flashTimeoutId);
    element.classList.remove("flash-danger", "flash-success", "flash-ready");
    element.classList.add(className);
    flashTimeoutId = setTimeout(() => element.classList.remove(className), 420);
  }
}

function renderRoleTabs(activeRole, state) {
  return ROLE_TABS.map((tab) => {
    const sectionId = getSectionForRole(tab.id);
    const isComplete = sectionId ? state.completedSections.includes(sectionId) : false;
    return [
      "<button class=\"role-tab\" type=\"button\" role=\"tab\" data-role-tab=\"" + tab.id + "\"",
      " data-active=\"" + String(tab.id === activeRole) + "\" data-complete=\"" + String(isComplete) + "\"",
      " aria-selected=\"" + String(tab.id === activeRole) + "\">",
      "<span class=\"role-tab-label\">" + escapeHtml(tab.label) + "</span>",
      "<span class=\"role-tab-title\">" + escapeHtml(tab.title) + (isComplete ? " · Synced" : "") + "</span>",
      "</button>",
    ].join("");
  }).join("");
}

function renderActivePage(activeRole, state, isRoundRunning, isModuleSolved) {
  if (activeRole === GUIDE_TAB_ID) return renderGuidePage();
  if (activeRole === TIMING_ROLE_IDS.PLAYER_TWO) return renderReactionPage(state, isRoundRunning, isModuleSolved);
  if (activeRole === TIMING_ROLE_IDS.PLAYER_THREE) return renderBalancePage(state, isRoundRunning, isModuleSolved);
  return renderSkillPage(state, isRoundRunning, isModuleSolved);
}

function renderSkillPage(state, isRoundRunning, isModuleSolved) {
  const targetDash = state.skill.targetWidth * 301.59;
  const targetGap = 301.59 - targetDash;
  const targetOffset = -(state.skill.targetStart * 301.59);
  const disabled = !isRoundRunning || isModuleSolved || state.skill.isComplete;
  return [
    "<section class=\"metal-panel timing-console skill-console\">",
    "  <div class=\"panel-nameplate\">Player 1 — Rotating Skill Check</div>",
    "  <div class=\"skill-streak-readout\"><span>Consecutive Locks</span><strong>" + state.skill.streak + " / " + state.skill.goal + "</strong></div>",
    "  <div class=\"skill-check-wrap\" data-complete=\"" + state.skill.isComplete + "\">",
    "    <svg class=\"skill-check-dial\" viewBox=\"0 0 120 120\" aria-label=\"Rotating skill check dial\">",
    "      <circle class=\"skill-ring-base\" cx=\"60\" cy=\"60\" r=\"48\"></circle>",
    "      <circle class=\"skill-ring-target\" cx=\"60\" cy=\"60\" r=\"48\" stroke-dasharray=\"" + targetDash + " " + targetGap + "\" stroke-dashoffset=\"" + targetOffset + "\"></circle>",
    "      <g class=\"skill-pointer\" style=\"transform: rotate(" + state.skill.angle + "deg)\"><line x1=\"60\" y1=\"12\" x2=\"60\" y2=\"55\"></line><circle cx=\"60\" cy=\"60\" r=\"5\"></circle></g>",
    "    </svg>",
    "    <button class=\"space-key timing-action-button\" type=\"button\" data-timing-action " + disabledAttr(disabled) + ">" + (state.skill.isComplete ? "LOCKED" : "SPACE") + "</button>",
    "  </div>",
    "  <div class=\"skill-streak-lamps\" aria-label=\"Skill check streak\">" + renderHitLamps(state.skill.streak, state.skill.goal) + "</div>",
    "  <div class=\"timing-brief\"><span>Objective</span><strong>Land eight consecutive checks. A miss resets the streak and removes five seconds.</strong></div>",
    "</section>",
  ].join("");
}

function renderReactionPage(state, isRoundRunning, isModuleSolved) {
  const reaction = state.reaction;
  const disabled = !isRoundRunning || isModuleSolved || reaction.isComplete;
  const label = reaction.isComplete ? "SEQUENCE CLEAR" : reaction.state === "ready" ? "PRESS SPACE" : reaction.state === "waiting" ? "WAIT" : "BEGIN SEQUENCE";
  return [
    "<section class=\"metal-panel timing-console reaction-console\">",
    "  <div class=\"panel-nameplate\">Player 2 — Reflex Gate</div>",
    "  <div class=\"reaction-array\" data-state=\"" + reaction.state + "\" data-complete=\"" + reaction.isComplete + "\">",
    "    <div class=\"reaction-lamp\" aria-label=\"Reaction signal is " + reaction.state + "\"><span></span></div>",
    "    <strong class=\"reaction-callout\">" + label + "</strong>",
    "    <button class=\"space-key timing-action-button\" type=\"button\" data-timing-action " + disabledAttr(disabled) + ">SPACE</button>",
    "  </div>",
    "  <div class=\"reaction-hit-row\" aria-label=\"Reaction hits\">" + renderHitLamps(reaction.hits, reaction.goal) + "</div>",
    "  <div class=\"timing-brief\"><span>Window</span><strong>Respond within " + reaction.windowMs + " ms of the lamp turning green. Clear three gates.</strong></div>",
    "</section>",
  ].join("");
}

function renderBalancePage(state, isRoundRunning, isModuleSolved) {
  const balance = state.balance;
  const disabled = !isRoundRunning || isModuleSolved || balance.isComplete;
  return [
    "<section class=\"metal-panel timing-console balance-console\">",
    "  <div class=\"panel-nameplate\">Player 3 — Drift Regulator</div>",
    "  <div class=\"balance-readout\" data-state=\"" + balance.state + "\" data-inside=\"" + balance.isInside + "\">",
    "    <div class=\"balance-track\">",
    "      <span class=\"balance-safe-zone\" style=\"left:" + balance.lowerBound * 100 + "%;width:" + (balance.upperBound - balance.lowerBound) * 100 + "%\"></span>",
    "      <span class=\"balance-slider\" style=\"left:" + balance.position * 100 + "%\"></span>",
    "    </div>",
    "    <div class=\"balance-scale\"><span>UNDER</span><span>SAFE TOLERANCE</span><span>OVER</span></div>",
    "  </div>",
    "  <div class=\"balance-progress\"><span style=\"width:" + balance.progressPercent + "%\"></span></div>",
    "  <strong class=\"balance-progress-label\">Stable hold: " + Math.floor(balance.progressPercent) + "% · Tolerance: " + Math.round(balance.safeWidthPercent) + "%</strong>",
    "  <button class=\"space-key timing-action-button wide\" type=\"button\" data-timing-action " + disabledAttr(disabled) + ">" + (balance.state === "idle" ? "SPACE — ENGAGE" : balance.isComplete ? "STABILIZED" : "SPACE — PULSE") + "</button>",
    "  <div class=\"timing-brief\"><span>Objective</span><strong>The marker begins underpowered. Raise it into the green band and hold it there as the safe tolerance steadily shrinks.</strong></div>",
    "</section>",
  ].join("");
}

function renderGuidePage() {
  return [
    "<section class=\"metal-panel guide-page-panel\">",
    "  <div class=\"panel-nameplate\">Game Guide — Chronolock Array</div>",
    "  <div class=\"guide-overview\"><p>Each POV controls one timing station with the Spacebar. Complete all three stations to synchronize the Chronolock.</p></div>",
    "  <div class=\"guide-grid\">",
    guideCard("Player 1 — Skill Check", ["Watch the needle rotate around the dial.", "Press Space only while it overlaps the amber notch.", "Complete eight checks consecutively.", "A miss resets the streak and removes five seconds."]),
    guideCard("Player 2 — Reflex Gate", ["Press Space once to begin the sequence.", "Wait while the signal remains red.", "Press within 400 ms after it turns green.", "Land three successful reactions to synchronize the gate."]),
    guideCard("Player 3 — Balance", ["The marker begins in the underpowered zone.", "Press Space to push it toward the green band.", "The slider constantly drifts back toward the left.", "The safe band narrows throughout the attempt.", "Keep the marker inside continuously for six seconds."]),
    "  </div>",
    "  <section class=\"guide-flow-panel\"><div class=\"panel-nameplate small\">Operator Notes</div><ol class=\"guide-flow-list\"><li>Arm the bomb round.</li><li>Swap freely between the three POV tabs.</li><li>Use Spacebar or the on-screen Space key for every action.</li><li>Completed stations stay locked while you finish the others.</li><li>A missed skill check removes five seconds; other timing failures remove thirty.</li></ol></section>",
    "</section>",
  ].join("");
}

function renderSupportColumn(state, activeRole) {
  return [
    "<div class=\"support-stack\">",
    "  <section class=\"metal-panel support-tile\"><div class=\"panel-nameplate small\">Chronolock State</div><span class=\"support-state\">" + escapeHtml(state.statusLabel) + "</span><p>Skill: " + (state.skill.isComplete ? "Synchronized" : state.skill.streak + "/" + state.skill.goal) + "<br>Reflex: " + sectionStatus(state, "reaction") + "<br>Balance: " + sectionStatus(state, "balance") + "</p></section>",
    "  <section class=\"metal-panel support-tile\"><div class=\"panel-nameplate small\">Active Input</div><span class=\"support-state\">SPACEBAR</span><p>Current station: " + escapeHtml(getRoleName(activeRole)) + ". Keyboard input works anywhere on this module.</p></section>",
    "  <section class=\"metal-panel support-tile support-log-tile\"><div class=\"panel-nameplate small\">Field Log</div><div class=\"field-log-list\">" + state.logs.slice(0, 4).map(renderLogEntry).join("") + "</div></section>",
    "</div>",
  ].join("");
}

function renderHitLamps(hits, goal) {
  return Array.from({ length: goal }, (_, index) => "<span data-active=\"" + (index < hits) + "\"></span>").join("");
}

function renderLogEntry(entry) {
  return "<div class=\"field-log-entry\" data-tone=\"" + escapeHtml(entry.tone) + "\"><span class=\"field-log-dot\"></span><p>" + escapeHtml(entry.message) + "</p></div>";
}

function guideCard(title, bullets) {
  return "<article class=\"guide-role-card\"><h3>" + escapeHtml(title) + "</h3><ul>" + bullets.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul></article>";
}

function sectionStatus(state, sectionId) {
  return state.completedSections.includes(sectionId) ? "Synchronized" : "Pending";
}

function getInstruction(activeRole, state) {
  if (!state.isArmed && !state.isSolved) return "Arm the round to enable all three timing stations.";
  if (state.isSolved) return "All timing channels are synchronized. Chronolock secured.";
  if (activeRole === GUIDE_TAB_ID) return "Review each station before beginning the timing sequence.";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_TWO) return "Wait for green, then react within 400 milliseconds. Complete three hits.";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_THREE) return "Tap with a steady cadence to hold the slider inside the safe band.";
  return "Land eight checks in a row by pressing Space inside each highlighted notch.";
}

function getRoleName(activeRole) {
  if (activeRole === GUIDE_TAB_ID) return "Game Guide";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_TWO) return "Player 2 — Reflex Gate";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_THREE) return "Player 3 — Drift Regulator";
  return "Player 1 — Skill Check";
}

function getRoleHudLabel(activeRole) {
  if (activeRole === GUIDE_TAB_ID) return "Chronolock - Guide";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_TWO) return "Player 2 - Reflex Gate";
  if (activeRole === TIMING_ROLE_IDS.PLAYER_THREE) return "Player 3 - Balance";
  return "Player 1 - Skill Check";
}

function getSectionForRole(roleId) {
  if (roleId === TIMING_ROLE_IDS.PLAYER_ONE) return "skill";
  if (roleId === TIMING_ROLE_IDS.PLAYER_TWO) return "reaction";
  if (roleId === TIMING_ROLE_IDS.PLAYER_THREE) return "balance";
  return null;
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function disabledAttr(disabled) {
  return disabled ? "disabled aria-disabled=\"true\"" : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export { createTimingPuzzleBoard };
