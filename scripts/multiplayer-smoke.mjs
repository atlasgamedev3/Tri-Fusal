import { Client } from "../client/node_modules/colyseus.js/build/esm/index.mjs";

const wsEndpoint = process.env.TRI_FUSAL_WS_URL || "ws://127.0.0.1:2567";
const httpEndpoint = process.env.TRI_FUSAL_HTTP_URL || wsEndpoint.replace(/^ws/, "http");
const client = new Client(wsEndpoint);
const roles = ["analyst", "technician", "operator"];

const waitFor = async (predicate, label, timeout = 8000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const ignoreMissionBroadcasts = (room) => {
  for (const type of ["interlockAck", "bombDefused", "bombDetonated", "missionComplication", "moduleSolved", "crisisResolved", "rolesAssigned", "boardAdvanced", "puzzleLocked", "penalty"]) {
    room.onMessage(type, () => {});
  }
};

const roomForRole = (rooms, role) => rooms.find((room) => room.state.players.get(room.sessionId)?.role === role);

const applyReadOrder = (digits, mode) => {
  if (mode === "RTL") return [...digits].reverse();
  if (mode === "PAIRS") {
    const ordered = [...digits];
    for (let index = 0; index + 1 < ordered.length; index += 2) [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
    return ordered;
  }
  if (mode === "OUTSIDE") {
    const ordered = [];
    for (let left = 0, right = digits.length - 1; left <= right; left += 1, right -= 1) {
      ordered.push(digits[left]);
      if (left !== right) ordered.push(digits[right]);
    }
    return ordered;
  }
  return [...digits];
};

const solveBoard = async (rooms, solo = false) => {
  const mission = rooms[0].state;
  const boardNumber = mission.boardNumber;
  const profile = String(mission.missionVariant || "ALPHA").split("|")[0] || "ALPHA";
  const modules = ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"];
  const analyst = solo ? rooms[0] : roomForRole(rooms, "analyst");
  const technician = solo ? rooms[0] : roomForRole(rooms, "technician");
  const operator = solo ? rooms[0] : roomForRole(rooms, "operator");
  if (!analyst || !technician || !operator) throw new Error("Randomized role assignment did not produce three unique stations");

  if (modules.includes("SIGNAL")) {
    analyst.send("puzzleAction", { action: "radar", value: mission.radarContact });
    await waitFor(() => rooms.every((room) => room.state.radarSolved), `board ${boardNumber} radar`);
    analyst.send("puzzleAction", { action: "frequency", value: mission.targetFrequency });
    analyst.send("puzzleAction", { action: "analystCheck", value: mission.cipherMap.split("~")[2] });
    analyst.send("puzzleAction", { action: "analystCheck2", value: mission.cipherMap.split("~")[4] });
    analyst.send("puzzleAction", { action: "analystCheck3", value: mission.cipherMap.split("~")[8] });
  }
  if (modules.includes("MATRIX")) {
    operator.send("puzzleAction", { action: "pattern", value: mission.patternCode });
  }
  if (modules.includes("CALIBRATION")) {
    technician.send("puzzleAction", { action: "calibration", value: Number(mission.authCode.split("|")[3]) });
    technician.send("puzzleAction", { action: "technicianCheck", value: mission.wireCodes.split("~")[2] });
  }
  operator.send("puzzleAction", { action: "verification", value: mission.relay2Rule });
  operator.send("puzzleAction", { action: "operatorCheck2", value: mission.cipherMap.split("~")[6] });
  await waitFor(() => rooms.every((room) => Boolean(room.state.crisisSeconds & 16)), `board ${boardNumber} anomaly chain`);
  operator.send("puzzleAction", { action: "operatorCheck3", value: mission.cipherMap.split("~")[10] });
  await waitFor(() => rooms.every((room) => Boolean(room.state.crisisSeconds & 64)), `board ${boardNumber} dispatch chain`);
  technician.send("puzzleAction", { action: "technicianCheck2", value: mission.wireCodes.split("~")[4] });
  await waitFor(() => rooms.every((room) => Boolean(room.state.crisisSeconds & 32)), `board ${boardNumber} patch chain`);
  operator.send("puzzleAction", { action: "order", value: mission.orderTarget.split("|")[0] });
  if (modules.includes("WIRES")) {
    const targetIds = mission.safeWireIds.split("");
    const expectedTargetCount = { TUTORIAL: 1, STANDARD: 1, HARD: 2, EXTREME: 3 }[mission.difficulty];
    if (targetIds.length !== expectedTargetCount) throw new Error(`Expected ${expectedTargetCount} ${mission.difficulty} targets, received ${targetIds.length}`);
    for (const id of targetIds) technician.send("puzzleAction", { action: "wire", value: id });
  }
  try {
    await waitFor(() => rooms.every((room) => room.state.isGameOver || room.state.boardNumber > boardNumber), `board ${boardNumber} ${profile} completion`);
  } catch (error) {
    const state = rooms[0].state;
    throw new Error(`${error.message}; state=${JSON.stringify({ radar: state.radarSolved, frequency: state.frequencySolved, analystAux: Boolean(state.crisisSeconds & 1), signature: Boolean(state.crisisSeconds & 4), pattern: state.patternSolved, calibration: state.authSolved, technicianAux: Boolean(state.crisisSeconds & 2), verification: state.relaySolved, routing: Boolean(state.crisisSeconds & 8), order: state.orderSolved, safeWireIds: state.safeWireIds, cutWireIds: [...state.cutWireIds], strikes: state.strikes })}`);
  }
};

const operation = `SMOKE-${Date.now()}`;
const rooms = [];
try {
  for (const [index, role] of roles.entries()) {
    const options = { operation, role, userId: `smoke-${role}-${Date.now()}`, playerName: role.toUpperCase(), difficulty: "HARD" };
    const room = index === 0 ? await client.create("tri_fusal", options) : await client.join("tri_fusal", options);
    ignoreMissionBroadcasts(room);
    rooms.push(room);
  }
  await waitFor(() => rooms.every((room) => room.state.players.size === 3), "three synchronized players");
  rooms[0].send("startMission");
  await waitFor(() => rooms.every((room) => room.state.gameStarted), "mission start");
  await waitFor(() => roles.every((role) => roomForRole(rooms, role)), "randomized unique roles");
  const boardCount = rooms[0].state.boardCount;
  for (let board = 1; board <= boardCount; board += 1) await solveBoard(rooms);
  await waitFor(() => rooms.every((room) => room.state.bombStatus === "defused"), "shared defusal");
  const leaderboard = await fetch(`${httpEndpoint}/api/tri-fusal/leaderboard?difficulty=HARD`).then((response) => response.json());
  if (!Array.isArray(leaderboard.entries)) throw new Error("Leaderboard endpoint returned an invalid payload");
  console.log(JSON.stringify({ mode: "host-and-join", operation, players: rooms[0].state.players.size, boards: boardCount, status: rooms[0].state.bombStatus, score: rooms[0].state.score }));
} finally {
  await Promise.all(rooms.map((room) => room.leave()));
}

const fallbackOperation = `FALLBACK-${Date.now()}`;
const fallbackRooms = [];
try {
  for (const [index, role] of ["analyst", "technician"].entries()) {
    const options = { operation: fallbackOperation, role, userId: `fallback-${role}-${Date.now()}`, playerName: role.toUpperCase(), difficulty: "STANDARD" };
    const room = index === 0 ? await client.create("tri_fusal", options) : await client.join("tri_fusal", options);
    ignoreMissionBroadcasts(room);
    fallbackRooms.push(room);
  }
  await waitFor(() => fallbackRooms.every((room) => room.state.players.size === 2), "two synchronized players");
  fallbackRooms[0].send("startMission");
  await waitFor(() => fallbackRooms.every((room) => room.state.gameStarted), "fallback mission start");
  const fallbackBoardCount = fallbackRooms[0].state.boardCount;
  for (let board = 1; board <= fallbackBoardCount; board += 1) await solveBoard(fallbackRooms, true);
  await waitFor(() => fallbackRooms.every((room) => room.state.bombStatus === "defused"), "two-operative fallback defusal");
  console.log(JSON.stringify({ mode: "two-operative-fallback", operation: fallbackOperation, players: fallbackRooms[0].state.players.size, status: fallbackRooms[0].state.bombStatus, score: fallbackRooms[0].state.score }));
} finally {
  await Promise.all(fallbackRooms.map((room) => room.leave()));
}

const soloOperation = `SOLO-${Date.now()}`;
const solo = await client.create("tri_fusal", { operation: soloOperation, role: "analyst", userId: `solo-smoke-${Date.now()}`, playerName: "WREN", difficulty: "EXTREME", soloDemo: true });
ignoreMissionBroadcasts(solo);
try {
  await waitFor(() => solo.state.players?.size === 3, "solo demo operatives");
  solo.send("startMission");
  await waitFor(() => solo.state.gameStarted, "solo mission start");
  const boardCount = solo.state.boardCount;
  for (let board = 1; board <= boardCount; board += 1) await solveBoard([solo], true);
  await waitFor(() => solo.state.bombStatus === "defused", "solo shared-role defusal");
  console.log(JSON.stringify({ mode: "solo-demo", operation: soloOperation, players: solo.state.players.size, boards: boardCount, status: solo.state.bombStatus, score: solo.state.score }));
} finally {
  await solo.leave();
}

const deterministicSeed = `VERIFY-${Date.now()}`;
const deterministicA = await client.create("tri_fusal", { operation: `SEED-A-${Date.now()}`, seed: deterministicSeed, role: "analyst", userId: `seed-a-${Date.now()}`, playerName: "WREN", difficulty: "HARD", soloDemo: true });
const deterministicB = await client.create("tri_fusal", { operation: `SEED-B-${Date.now()}`, seed: deterministicSeed, role: "analyst", userId: `seed-b-${Date.now()}`, playerName: "WREN", difficulty: "HARD", soloDemo: true });
ignoreMissionBroadcasts(deterministicA);
ignoreMissionBroadcasts(deterministicB);
try {
  await waitFor(() => deterministicA.state.missionSeed === deterministicSeed && deterministicB.state.missionSeed === deterministicSeed, "seeded board hydration");
  const fingerprint = (state) => [state.missionSeed, state.bombId, state.radarContact, state.targetFrequency, state.patternCode, state.cipherMap, state.cipherDirection, state.authCode, state.relay1Rule, state.relay2Rule, state.orderTarget, state.safeWireIds].join("|");
  if (fingerprint(deterministicA.state) !== fingerprint(deterministicB.state)) throw new Error("Identical mission seeds generated different boards");
  deterministicA.send("startMission");
  await waitFor(() => deterministicA.state.gameStarted, "seeded validation mission start");
  const validationProfile = deterministicA.state.missionVariant.split("|")[0];
  const validationModules = ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"];
  if (validationModules.includes("SIGNAL")) {
    const wrongContact = ["TGT-01", "TGT-02", "UNK-A"].find((contact) => contact !== deterministicA.state.radarContact);
    deterministicA.send("puzzleAction", { action: "radar", value: wrongContact });
  } else if (validationModules.includes("MATRIX")) {
    deterministicA.send("puzzleAction", { action: "pattern", value: "-1" });
  } else {
    const target = Number(deterministicA.state.authCode.split("|")[3]);
    deterministicA.send("puzzleAction", { action: "calibration", value: target === 99 ? 98 : 99 });
  }
  await waitFor(() => deterministicA.state.strikes === 1, "invalid active-puzzle strike");
  console.log(JSON.stringify({ mode: "seed-and-penalty", seed: deterministicSeed, deterministic: true, cipherStrikes: deterministicA.state.strikes }));
} finally {
  await deterministicA.leave();
  await deterministicB.leave();
}
