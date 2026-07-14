import { BOMB_EVENTS, BOMB_STATUS } from "../game/bombSystem.js";
import { ROLE_IDS, WIRE_PUZZLE_EVENTS, WIRE_PUZZLE_STATUS } from "../game/wirePuzzleSystem.js";

const GUIDE_TAB_ID = "game-guide";

const ROLE_TABS = Object.freeze([
  { id: ROLE_IDS.PLAYER_ONE, label: "Player 1", title: "Wire Panel" },
  { id: ROLE_IDS.PLAYER_TWO, label: "Player 2", title: "Reroute" },
  { id: ROLE_IDS.PLAYER_THREE, label: "Player 3", title: "Stabilizer" },
  { id: GUIDE_TAB_ID, label: "Game Guide", title: "How To Play" },
]);

const LEFT_TERMINALS = Object.freeze(["A", "B", "C", "D", "E", "F"]);
const RIGHT_TERMINALS = Object.freeze(["1", "2", "3", "4", "5", "6"]);
const WIRE_LAYOUT_ORDER = Object.freeze([3, 5, 1, 4, 2, 0]);

function createWirePuzzleBoard(options) {
  const bombSystem = options.bombSystem;
  const wirePuzzle = options.wirePuzzle;

  let activeRole = ROLE_IDS.PLAYER_ONE;
  let selectedLeadId = null;
  let flashTimeoutId = null;

  const element = document.createElement("section");
  element.className = "wire-puzzle-board";
  element.addEventListener("click", handleClick);
  element.addEventListener("keydown", handleKeydown);

  const render = () => {
    const bombState = bombSystem.getState();
    const puzzleState = wirePuzzle.getState();
    const focusState = getFocusState(wirePuzzle, activeRole);
    const isRoundRunning = bombState.status === BOMB_STATUS.RUNNING;
    const isBombFinished = bombState.status === BOMB_STATUS.DEFUSED || bombState.status === BOMB_STATUS.DETONATED;
    const isWireModuleSolved = bombState.completedPuzzleIds.includes("puzzle-1");
    const selectedLead = ensureSelectedLead(puzzleState);
    const canOperateLead = Boolean(selectedLead) && isRoundRunning && !isWireModuleSolved;
    const canCutSelected = canOperateLead && puzzleState.hasSafeWindow;

    element.dataset.focusRole = activeRole;
    element.dataset.safeState = getSafeState(puzzleState);
    element.dataset.moduleStatus = puzzleState.status;

    element.innerHTML = [
      "<div class=\"station-shell\">",
      "  <div class=\"role-tab-row station-tabs\" role=\"tablist\" aria-label=\"Switch local player point of view\">",
      renderRoleTabs(activeRole),
      "  </div>",
      "  <div class=\"station-service-row\">",
      "    <div class=\"station-instruction-plate\">",
      "      <span class=\"service-kicker\">",
      escapeHtml(focusState.roleName),
      "</span>",
      "      <p>",
      escapeHtml(getFocusInstruction(activeRole, puzzleState)),
      "</p>",
      "    </div>",
      "    <div class=\"service-readouts\">",
      "      <span class=\"service-tag\">Selected Lead: ",
      escapeHtml(selectedLead ? selectedLead.colorName : "None"),
      "</span>",
      "      <span class=\"service-tag\">Last Probe: ",
      escapeHtml(puzzleState.lastTestedWireLabel),
      "</span>",
      "    </div>",
      "    <div class=\"service-controls\">",
      "      <button class=\"service-button primary\" type=\"button\" data-start-round ",
      getDisabledAttr(isRoundRunning),
      ">Arm</button>",
      "      <button class=\"service-button\" type=\"button\" data-reset-round>Reset</button>",
      "      <button class=\"service-button danger\" type=\"button\" data-test-detonation ",
      getDisabledAttr(isBombFinished),
      ">Detonate</button>",
      "    </div>",
      "  </div>",
      "  <div class=\"station-grid\" data-page=\"",
      activeRole,
      "\">",
      "    <section class=\"station-main-column station-page\">",
      renderActivePage(activeRole, {
        puzzleState,
        selectedLead,
        canCutSelected,
        canOperateLead,
        isRoundRunning,
        isWireModuleSolved,
      }),
      "    </section>",
      "    <aside class=\"station-side-column station-support-column\">",
      renderSupportColumn({
        activeRole,
        puzzleState,
        selectedLead,
        isRoundRunning,
        isWireModuleSolved,
      }),
      "    </aside>",
      "  </div>",
      "</div>",
    ].join("");

    options.onRoleChange?.(getRoleHudLabel(activeRole));
  };

  const unsubscribers = [
    bombSystem.on(BOMB_EVENTS.STARTED, render),
    bombSystem.on(BOMB_EVENTS.TICK, render),
    bombSystem.on(BOMB_EVENTS.TIME_PENALIZED, render),
    bombSystem.on(BOMB_EVENTS.PUZZLE_COMPLETED, render),
    bombSystem.on(BOMB_EVENTS.PUZZLE_RESET, render),
    bombSystem.on(BOMB_EVENTS.RESET, render),
    bombSystem.on(BOMB_EVENTS.DEFUSED, render),
    bombSystem.on(BOMB_EVENTS.DETONATED, render),
    bombSystem.on(BOMB_EVENTS.STOPPED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.ARMED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.DISARMED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.RESET, () => {
      selectedLeadId = null;
      render();
    }),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.UPDATED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.TESTED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.REROUTED, render),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.SAFE_WINDOW_OPENED, () => {
      triggerTransientClass("flash-ready");
      render();
    }),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.STRIKE, () => {
      triggerTransientClass("flash-danger");
      render();
    }),
    wirePuzzle.on(WIRE_PUZZLE_EVENTS.SOLVED, () => {
      triggerTransientClass("flash-success");
      render();
    }),
  ];

  render();

  return {
    element,
    destroy() {
      clearTimeout(flashTimeoutId);

      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }

      element.removeEventListener("click", handleClick);
      element.removeEventListener("keydown", handleKeydown);
      element.remove();
    },
  };

  function handleClick(event) {
    const roleButton = event.target.closest("[data-role-tab]");
    const startButton = event.target.closest("[data-start-round]");
    const resetButton = event.target.closest("[data-reset-round]");
    const detonationButton = event.target.closest("[data-test-detonation]");
    const selectWire = event.target.closest("[data-select-wire]");
    const selectLead = event.target.closest("[data-select-lead]");
    const cutButton = event.target.closest("[data-cut-selected]");
    const probeButton = event.target.closest("[data-probe-selected]");
    const rerouteButton = event.target.closest("[data-reroute-selected]");
    const stabilizeButton = event.target.closest("[data-stabilize]");

    if (roleButton) {
      activeRole = roleButton.dataset.roleTab;
      render();
      return;
    }

    if (startButton) {
      options.onStartRound?.();
      return;
    }

    if (resetButton) {
      options.onResetRound?.();
      return;
    }

    if (detonationButton) {
      options.onTestDetonation?.();
      return;
    }

    if (selectWire) {
      setSelectedLead(selectWire.dataset.selectWire, ROLE_IDS.PLAYER_ONE);
      return;
    }

    if (selectLead) {
      setSelectedLead(selectLead.dataset.selectLead, ROLE_IDS.PLAYER_TWO);
      return;
    }

    if (cutButton && selectedLeadId) {
      activeRole = ROLE_IDS.PLAYER_ONE;
      wirePuzzle.cutWire(selectedLeadId);
      return;
    }

    if (probeButton && selectedLeadId) {
      activeRole = ROLE_IDS.PLAYER_TWO;
      wirePuzzle.testWire(selectedLeadId);
      return;
    }

    if (rerouteButton && selectedLeadId) {
      activeRole = ROLE_IDS.PLAYER_TWO;
      wirePuzzle.rerouteWire(selectedLeadId);
      return;
    }

    if (stabilizeButton) {
      activeRole = ROLE_IDS.PLAYER_THREE;
      wirePuzzle.pulseStabilizer();
      return;
    }
  }

  function handleKeydown(event) {
    const selectableWire = event.target.closest("[data-select-wire]");

    if (!selectableWire) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    setSelectedLead(selectableWire.dataset.selectWire, ROLE_IDS.PLAYER_ONE);
  }

  function setSelectedLead(leadId, nextRole) {
    if (!leadId) {
      return;
    }

    selectedLeadId = leadId;
    activeRole = nextRole;
    render();
  }

  function ensureSelectedLead(puzzleState) {
    if (!puzzleState.wires.length) {
      selectedLeadId = null;
      return null;
    }

    const currentLead = puzzleState.wires.find((wire) => wire.id === selectedLeadId) ?? null;

    if (currentLead) {
      return currentLead;
    }

    selectedLeadId = puzzleState.wires[0].id;
    return puzzleState.wires[0];
  }

  function triggerTransientClass(className) {
    clearTimeout(flashTimeoutId);
    element.classList.remove("flash-danger", "flash-success", "flash-ready");
    element.classList.add(className);
    flashTimeoutId = setTimeout(() => {
      element.classList.remove(className);
    }, 420);
  }
}

function renderRoleTabs(activeRole) {
  return ROLE_TABS.map((tab) => {
    return [
      "<button class=\"role-tab\" type=\"button\" role=\"tab\" data-role-tab=\"",
      tab.id,
      "\" data-active=\"",
      String(tab.id === activeRole),
      "\" aria-selected=\"",
      String(tab.id === activeRole),
      "\">",
      "<span class=\"role-tab-label\">",
      escapeHtml(tab.label),
      "</span>",
      "<span class=\"role-tab-title\">",
      escapeHtml(tab.title),
      "</span>",
      "</button>",
    ].join("");
  }).join("");
}

function renderActivePage(activeRole, context) {
  if (activeRole === GUIDE_TAB_ID) {
    return renderGuidePage(context);
  }

  if (activeRole === ROLE_IDS.PLAYER_TWO) {
    return renderPlayerTwoPage(context);
  }

  if (activeRole === ROLE_IDS.PLAYER_THREE) {
    return renderPlayerThreePage(context);
  }

  return renderWireCabinet(context);
}

function renderGuidePage(context) {
  return [
    "<section class=\"metal-panel guide-page-panel\">",
    "  <div class=\"panel-nameplate\">Game Guide — Fusebreak Relay</div>",
    "  <div class=\"guide-overview\">",
    "    <p>Tri-Fusal is a three-role communication puzzle. One person cuts, one person diagnoses and reroutes, and one person stabilizes the system. No role has enough information alone.</p>",
    "    <div class=\"page-briefing-grid\">",
    "      <div class=\"console-readout\">",
    "        <span>Goal</span>",
    "        <strong>Cut the unstable rerouted lead during the safe window</strong>",
    "      </div>",
    "      <div class=\"console-readout\">",
    "        <span>Penalty</span>",
        "        <strong>Each major mistake removes one-third of the bomb time</strong>",
    "      </div>",
    "    </div>",
    "  </div>",
    "  <div class=\"guide-grid\">",
    renderGuideRoleCard("Player 1 — Wire Panel", [
      "Select a specific wire on the main harness.",
      "Wait until Player 2 reroutes the correct lead.",
      "Only cut when Player 3 confirms the safe window is open.",
      "A wrong cut or a mistimed cut causes a strike and heavy time loss.",
    ]),
    renderGuideRoleCard("Player 2 — Reroute", [
      "Select one lead at a time from the reroute console.",
      "Probe different leads to trigger voltage spikes.",
      "Work with Player 3 to identify the strongest instability reading.",
      "Reroute the suspected unstable lead before stabilization begins.",
    ]),
    renderGuideRoleCard("Player 3 — Stabilizer", [
      "Watch the spike meter after every probe.",
      "Call out which lead creates the strongest voltage spike.",
      "After reroute, pulse the stabilizer to charge the system.",
      "When the safe window lamp opens, count down for Player 1.",
    ]),
    "  </div>",
    "  <section class=\"guide-flow-panel\">",
    "    <div class=\"panel-nameplate small\">Round Flow</div>",
    "    <ol class=\"guide-flow-list\">",
    "      <li>Arm the bomb round.</li>",
    "      <li>Player 2 probes leads while Player 3 watches the spike meter.</li>",
    "      <li>Identify the lead with the strongest instability signal.</li>",
    "      <li>Player 2 reroutes that lead.</li>",
    "      <li>Player 3 charges the stabilizer until the safe window opens.</li>",
    "      <li>Player 1 cuts the selected rerouted lead before the window collapses.</li>",
    "      <li>If the team fails, reset the round and run the sequence again.</li>",
    "    </ol>",
    "  </section>",
    "</section>",
  ].join("");
}

function renderPlayerTwoPage(context) {
  return [
    renderReroutePanel({
      puzzleState: context.puzzleState,
      selectedLead: context.selectedLead,
      canOperateLead: context.canOperateLead,
      isWireModuleSolved: context.isWireModuleSolved,
      variantClass: "page-panel",
    }),
    "<section class=\"metal-panel page-briefing-panel\">",
    "  <div class=\"panel-nameplate small\">Reroute Briefing</div>",
    "  <p>Select one lead, probe it, compare the spike callout with Player 3, then reroute the strongest candidate.</p>",
    "  <div class=\"page-briefing-grid\">",
    "    <div class=\"console-readout\">",
    "      <span>Selected Lead</span>",
    "      <strong>",
    escapeHtml(context.selectedLead ? context.selectedLead.colorName : "None"),
    "</strong>",
    "    </div>",
    "    <div class=\"console-readout\">",
    "      <span>Module State</span>",
    "      <strong>",
    escapeHtml(context.puzzleState.statusLabel),
    "</strong>",
    "    </div>",
    "  </div>",
    "</section>",
  ].join("");
}

function renderPlayerThreePage(context) {
  return [
    renderStabilizerPanel({
      puzzleState: context.puzzleState,
      canOperateLead: context.canOperateLead,
      isWireModuleSolved: context.isWireModuleSolved,
      variantClass: "page-panel",
    }),
    "<section class=\"metal-panel page-briefing-panel\">",
    "  <div class=\"panel-nameplate small\">Stabilizer Briefing</div>",
    "  <p>Watch the probe spike, charge the dampener after reroute, then call the countdown when the safe lamp opens.</p>",
    "  <div class=\"page-briefing-grid\">",
    "    <div class=\"console-readout\">",
    "      <span>Last Probe</span>",
    "      <strong>",
    escapeHtml(context.puzzleState.lastTestedWireLabel),
    "</strong>",
    "    </div>",
    "    <div class=\"console-readout\">",
    "      <span>Safe Window</span>",
    "      <strong>",
    escapeHtml(getSafeWindowLabel(context.puzzleState)),
    "</strong>",
    "    </div>",
    "  </div>",
    "</section>",
  ].join("");
}

function renderGuideRoleCard(title, bullets) {
  return [
    "<article class=\"guide-role-card\">",
    "  <h3>",
    escapeHtml(title),
    "</h3>",
    "  <ul>",
    bullets
      .map((bullet) => {
        return "<li>" + escapeHtml(bullet) + "</li>";
      })
      .join(""),
    "  </ul>",
    "</article>",
  ].join("");
}

function renderWireCabinet(context) {
  return [
    "<div class=\"metal-panel wire-cabinet\">",
    "  <div class=\"panel-nameplate\">Player 1 — Wire Panel</div>",
    "  <div class=\"wire-cabinet-frame\">",
    renderWireHarness(context.puzzleState, context.selectedLead),
    "  </div>",
    "  <div class=\"wire-cabinet-lower\">",
    "    <section class=\"instruction-plate\">",
    "      <span class=\"plate-title\">Instruction</span>",
    "      <p>Cut the rerouted unstable lead during the safe window.</p>",
    "      <strong>",
    escapeHtml(context.selectedLead ? context.selectedLead.colorName + " lead selected" : "Select a lead"),
    "</strong>",
    "    </section>",
    "    <section class=\"cut-bay\" data-ready=\"",
    String(context.canCutSelected),
    "\" data-locked=\"",
    String(!context.canCutSelected),
    "\">",
    "      <div class=\"cut-bay-guard\" aria-hidden=\"true\">",
    "        <span></span><span></span><span></span>",
    "      </div>",
    "      <button class=\"cut-trigger\" type=\"button\" data-cut-selected ",
    getDisabledAttr(!context.canCutSelected || !context.isRoundRunning || context.isWireModuleSolved),
    ">CUT</button>",
    "      <div class=\"cut-status\">",
    context.canCutSelected ? "Cut channel armed" : "Mechanical lock engaged",
    "      </div>",
    "      <div class=\"cut-tool\" aria-hidden=\"true\">",
    "        <span class=\"tool-jaw jaw-left\"></span>",
    "        <span class=\"tool-jaw jaw-right\"></span>",
    "        <span class=\"tool-handle handle-left\"></span>",
    "        <span class=\"tool-handle handle-right\"></span>",
    "      </div>",
    "    </section>",
    "  </div>",
    "  <section class=\"field-log-strip\">",
    "    <div class=\"field-log-header\">",
    "      <span>Field Log</span>",
    "      <strong>",
    escapeHtml(getPanelModeText(context.puzzleState)),
    "</strong>",
    "    </div>",
    "    <div class=\"field-log-list\">",
    context.puzzleState.logs.slice(0, 3).map(renderLogEntry).join(""),
    "    </div>",
    "  </section>",
    "</div>",
  ].join("");
}

function renderWireHarness(puzzleState, selectedLead) {
  const wires = puzzleState.wires;
  const width = 760;
  const height = 404;
  const startX = 80;
  const endX = 682;
  const slotGap = 56;
  const baseY = 56;

  return [
    "<svg class=\"wire-svg\" viewBox=\"0 0 ",
    String(width),
    " ",
    String(height),
    "\" role=\"img\" aria-label=\"Wire harness panel\">",
    "<defs>",
    "<filter id=\"wireGlow\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"140%\">",
    "  <feDropShadow dx=\"0\" dy=\"0\" stdDeviation=\"4\" flood-color=\"#f0b562\" flood-opacity=\"0.4\"/>",
    "</filter>",
    "</defs>",
    "<rect class=\"wire-box-backplate\" x=\"12\" y=\"12\" width=\"736\" height=\"380\" rx=\"18\"></rect>",
    renderTerminalColumns(wires, baseY, slotGap),
    wires
      .map((wire, index) => {
        const startY = baseY + index * slotGap;
        const endY = baseY + WIRE_LAYOUT_ORDER[index] * slotGap;
        const path = buildWirePath(startX, startY, endX, endY, index);

        return [
          "<g class=\"wire-svg-group\" data-select-wire=\"",
          wire.id,
          "\" data-selected=\"",
          String(selectedLead?.id === wire.id),
          "\" data-rerouted=\"",
          String(wire.isRerouted),
          "\" data-last-tested=\"",
          String(wire.isLastTested),
          "\" role=\"button\" tabindex=\"0\" aria-label=\"Select ",
          escapeHtml(wire.colorName),
          " lead\">",
          "<path class=\"wire-visible-shadow\" d=\"",
          path,
          "\"></path>",
          "<path class=\"wire-visible-path\" d=\"",
          path,
          "\" style=\"--wire-accent: ",
          wire.hex,
          "\"></path>",
          "<path class=\"wire-hit-path\" d=\"",
          path,
          "\"></path>",
          "</g>",
        ].join("");
      })
      .join(""),
    "</svg>",
  ].join("");
}

function renderTerminalColumns(wires, baseY, slotGap) {
  return wires
    .map((wire, index) => {
      const leftLabel = LEFT_TERMINALS[index] ?? String(index + 1);
      const rightLabel = RIGHT_TERMINALS[WIRE_LAYOUT_ORDER[index]] ?? String(index + 1);
      const leftY = baseY + index * slotGap;
      const rightY = baseY + WIRE_LAYOUT_ORDER[index] * slotGap;

      return [
        "<g class=\"terminal-pair\">",
        "<rect class=\"terminal-label-plate\" x=\"20\" y=\"",
        String(leftY - 18),
        "\" width=\"34\" height=\"36\" rx=\"6\"></rect>",
        "<text class=\"terminal-label-text\" x=\"37\" y=\"",
        String(leftY + 7),
        "\" text-anchor=\"middle\">",
        leftLabel,
        "</text>",
        "<circle class=\"terminal-ring outer\" cx=\"80\" cy=\"",
        String(leftY),
        "\" r=\"18\"></circle>",
        "<circle class=\"terminal-ring inner\" cx=\"80\" cy=\"",
        String(leftY),
        "\" r=\"10\"></circle>",
        "<rect class=\"terminal-label-plate right\" x=\"706\" y=\"",
        String(rightY - 18),
        "\" width=\"34\" height=\"36\" rx=\"6\"></rect>",
        "<text class=\"terminal-label-text\" x=\"723\" y=\"",
        String(rightY + 7),
        "\" text-anchor=\"middle\">",
        rightLabel,
        "</text>",
        "<circle class=\"terminal-ring outer\" cx=\"682\" cy=\"",
        String(rightY),
        "\" r=\"18\"></circle>",
        "<circle class=\"terminal-ring inner\" cx=\"682\" cy=\"",
        String(rightY),
        "\" r=\"10\"></circle>",
        "<circle class=\"terminal-lamp\" cx=\"748\" cy=\"",
        String(rightY),
        "\" r=\"6\"></circle>",
        "</g>",
      ].join("");
    })
    .join("");
}

function renderReroutePanel(context) {
  const panelClass = context.variantClass ? "metal-panel reroute-console " + context.variantClass : "metal-panel reroute-console";

  return [
    "<section class=\"",
    panelClass,
    "\">",
    "  <div class=\"panel-nameplate\">Player 2 — Reroute</div>",
    "  <div class=\"console-header-row\">",
    "    <span class=\"console-label\">Probe Status</span>",
    "    <span class=\"console-signal\">",
    escapeHtml(context.puzzleState.voltageBand),
    "</span>",
    "  </div>",
    "  <div class=\"channel-bank\">",
    context.puzzleState.wires
      .map((wire, index) => {
        const stateLabel = wire.isRerouted ? "Rerouted" : wire.isLastTested ? "Last probe" : "Idle";
        return [
          "<button class=\"channel-switch\" type=\"button\" data-select-lead=\"",
          wire.id,
          "\" data-selected=\"",
          String(context.selectedLead?.id === wire.id),
          "\" data-rerouted=\"",
          String(wire.isRerouted),
          "\" data-last-tested=\"",
          String(wire.isLastTested),
          "\" style=\"--wire-accent: ",
          wire.hex,
          "\" aria-label=\"Select ",
          escapeHtml(wire.colorName),
          " channel\">",
          "<span class=\"channel-index\">",
          String(index + 1),
          "</span>",
          "<span class=\"channel-lamp\"></span>",
          "<span class=\"channel-state\">",
          escapeHtml(stateLabel),
          "</span>",
          "<span class=\"channel-probes\">",
          String(wire.testCount),
          "</span>",
          "</button>",
        ].join("");
      })
      .join(""),
    "  </div>",
    "  <div class=\"console-readouts\">",
    "    <div class=\"console-readout\">",
    "      <span>Selected Lead</span>",
    "      <strong>",
    escapeHtml(context.selectedLead ? context.selectedLead.colorName : "None"),
    "</strong>",
    "    </div>",
    "    <div class=\"console-readout\">",
    "      <span>Most Recent Probe</span>",
    "      <strong>",
    escapeHtml(context.puzzleState.lastTestedWireLabel),
    "</strong>",
    "    </div>",
    "  </div>",
    "  <div class=\"console-actions\">",
    "    <button class=\"service-button\" type=\"button\" data-probe-selected ",
    getDisabledAttr(!context.canOperateLead || context.isWireModuleSolved),
    ">Probe</button>",
    "    <button class=\"service-button primary\" type=\"button\" data-reroute-selected ",
    getDisabledAttr(!context.canOperateLead || context.isWireModuleSolved || context.puzzleState.status !== WIRE_PUZZLE_STATUS.DIAGNOSING),
    ">Reroute</button>",
    "  </div>",
    "</section>",
  ].join("");
}

function renderStabilizerPanel(context) {
  const gaugeValue = Math.round(context.puzzleState.voltageLevel * 2);
  const gaugeRotation = -100 + (gaugeValue / 200) * 200;
  const panelClass = context.variantClass ? "metal-panel stabilizer-console " + context.variantClass : "metal-panel stabilizer-console";

  return [
    "<section class=\"",
    panelClass,
    "\">",
    "  <div class=\"panel-nameplate\">Player 3 — Stabilizer</div>",
    "  <div class=\"stabilizer-grid\">",
    "    <section class=\"analog-gauge-panel\">",
    "      <div class=\"gauge-caption\">System Voltage</div>",
    "      <div class=\"analog-gauge\">",
    "        <div class=\"gauge-arc\"></div>",
    "        <div class=\"gauge-needle\" style=\"transform: translateX(-50%) rotate(",
    String(gaugeRotation),
    "deg)\"></div>",
    "        <div class=\"gauge-hub\"></div>",
    "        <div class=\"gauge-ticks\">",
    "          <span style=\"--tick-rotate:-84deg\">0</span>",
    "          <span style=\"--tick-rotate:-42deg\">50</span>",
    "          <span style=\"--tick-rotate:0deg\">100</span>",
    "          <span style=\"--tick-rotate:42deg\">150</span>",
    "          <span style=\"--tick-rotate:84deg\">200</span>",
    "        </div>",
    "      </div>",
    "      <div class=\"gauge-readout\">",
    String(gaugeValue),
    " V</div>",
    "    </section>",
    "    <section class=\"stability-panel\">",
    "      <div class=\"gauge-caption\">Stability</div>",
    "      <div class=\"stability-meter\">",
    renderStabilitySegments(context.puzzleState.stabilityPercent),
    "      </div>",
    "      <div class=\"stability-status-row\">",
    "        <span class=\"status-lamp\" data-tone=\"",
    getSafeLampTone(context.puzzleState),
    "\"></span>",
    "        <strong>",
    escapeHtml(getStabilityLabel(context.puzzleState)),
    "</strong>",
    "      </div>",
    "      <button class=\"service-button primary pulse-button\" type=\"button\" data-stabilize ",
    getDisabledAttr(
      !context.canOperateLead ||
        context.isWireModuleSolved ||
        (context.puzzleState.status !== WIRE_PUZZLE_STATUS.REROUTED &&
          context.puzzleState.status !== WIRE_PUZZLE_STATUS.SAFE_WINDOW),
    ),
    ">Pulse Stabilizer</button>",
    "    </section>",
    "  </div>",
    "  <div class=\"safe-window-console\">",
    "    <span class=\"console-label\">Safe Window</span>",
    "    <strong class=\"safe-window-readout\" data-tone=\"",
    getSafeLampTone(context.puzzleState),
    "\">",
    escapeHtml(getSafeWindowLabel(context.puzzleState)),
    "</strong>",
    "  </div>",
    "</section>",
  ].join("");
}

function renderSupportColumn(context) {
  return [
    "<section class=\"support-stack\">",
    "  <div class=\"metal-panel support-tile\">",
    "    <div class=\"panel-nameplate small\">Focus Snapshot</div>",
    "    <p>",
    escapeHtml(getFocusInstruction(context.activeRole, context.puzzleState)),
    "</p>",
    "    <div class=\"page-briefing-grid compact\">",
    "      <div class=\"console-readout\">",
    "        <span>Selected</span>",
    "        <strong>",
    escapeHtml(context.selectedLead ? context.selectedLead.colorName : "None"),
    "</strong>",
    "      </div>",
    "      <div class=\"console-readout\">",
    "        <span>Last Probe</span>",
    "        <strong>",
    escapeHtml(context.puzzleState.lastTestedWireLabel),
    "</strong>",
    "      </div>",
    "    </div>",
    "  </div>",
    "  <div class=\"metal-panel support-tile\">",
    "    <div class=\"panel-nameplate small\">Current State</div>",
    "    <p>",
    escapeHtml(context.puzzleState.instructionText),
    "</p>",
    "    <strong class=\"support-state\">",
    escapeHtml(context.puzzleState.statusLabel),
    "</strong>",
    "  </div>",
    "  <div class=\"metal-panel support-tile support-log-tile\">",
    "    <div class=\"panel-nameplate small\">Field Log</div>",
    "    <div class=\"field-log-list\">",
    context.puzzleState.logs.slice(0, 3).map(renderLogEntry).join(""),
    "    </div>",
    "  </div>",
    "</section>",
  ].join("");
}

function renderLogEntry(entry) {
  return [
    "<article class=\"field-log-entry\" data-tone=\"",
    escapeHtml(entry.tone),
    "\">",
    "  <span class=\"field-log-dot\"></span>",
    "  <p>",
    escapeHtml(entry.message),
    "</p>",
    "</article>",
  ].join("");
}

function renderStabilitySegments(stabilityPercent) {
  return Array.from({ length: 7 }, (_, index) => {
    const threshold = ((index + 1) / 7) * 100;
    return [
      "<span class=\"stability-segment\" data-active=\"",
      String(stabilityPercent >= threshold),
      "\"></span>",
    ].join("");
  }).join("");
}

function buildWirePath(startX, startY, endX, endY, index) {
  const firstControlX = 244 + index * 12;
  const secondControlX = 510 - index * 14;
  const centerY = (startY + endY) / 2;
  const firstControlY = startY + (centerY - startY) * 0.45;
  const secondControlY = endY - (endY - centerY) * 0.45;

  return [
    "M ",
    startX,
    " ",
    startY,
    " C ",
    firstControlX,
    " ",
    firstControlY,
    ", ",
    secondControlX,
    " ",
    secondControlY,
    ", ",
    endX,
    " ",
    endY,
  ].join("");
}

function getFocusInstruction(activeRole, puzzleState) {
  if (activeRole === GUIDE_TAB_ID) {
    return "Review the team roles, puzzle flow, and failure conditions before switching back into a station view.";
  }

  if (activeRole === ROLE_IDS.PLAYER_TWO) {
    return puzzleState.status === WIRE_PUZZLE_STATUS.DIAGNOSING
      ? "Select a lead, probe it, and reroute the strongest spike."
      : "Reroute is set. Hold until the stabilizer unlocks the cut window.";
  }

  if (activeRole === ROLE_IDS.PLAYER_THREE) {
    return puzzleState.hasSafeWindow
      ? "Window is live. Call the countdown while Player 1 cuts."
      : puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED
        ? "Charge the stabilizer until the safe lamp opens."
        : "Watch the spike meter and wait for the reroute command.";
  }

  return puzzleState.hasSafeWindow
    ? "Cut the selected rerouted lead before the safe window collapses."
    : "Track the rerouted lead and wait for the safe lamp before cutting.";
}

function getFocusState(wirePuzzle, activeRole) {
  if (activeRole === GUIDE_TAB_ID) {
    return {
      roleName: "Game Guide",
    };
  }

  return wirePuzzle.getRoleState(activeRole);
}

function getRoleHudLabel(activeRole) {
  const tab = ROLE_TABS.find((item) => item.id === activeRole) ?? ROLE_TABS[0];
  return tab.label + " — " + tab.title;
}

function getSafeState(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return "open";
  }

  if (puzzleState.lastStrike) {
    return "danger";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "charging";
  }

  return "idle";
}

function getSafeLampTone(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return "safe";
  }

  if (puzzleState.lastStrike) {
    return "danger";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "charging";
  }

  return "idle";
}

function getSafeWindowLabel(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return formatTenths(puzzleState.safeWindowRemainingMs);
  }

  if (puzzleState.lastStrike) {
    return "Reset Required";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "Charging";
  }

  return "Locked";
}

function getStabilityLabel(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return "Window Open";
  }

  if (puzzleState.lastStrike) {
    return "Fault";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "Charging";
  }

  return "Idle";
}

function getPanelModeText(puzzleState) {
  if (puzzleState.hasSafeWindow) {
    return "Cut Window Live";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.REROUTED) {
    return "Stabilizer Engaged";
  }

  if (puzzleState.lastStrike) {
    return "Strike Logged";
  }

  if (puzzleState.status === WIRE_PUZZLE_STATUS.SOLVED) {
    return "Module Secure";
  }

  return "Awaiting Probe";
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

function getDisabledAttr(isDisabled) {
  return isDisabled ? "disabled" : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export { createWirePuzzleBoard };
