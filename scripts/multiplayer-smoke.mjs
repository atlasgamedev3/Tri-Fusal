import { Client } from "../client/node_modules/colyseus.js/build/esm/index.mjs";

const client = new Client("ws://127.0.0.1:2567");
const roles = ["analyst", "technician", "operator"];

const waitFor = async (predicate, label, timeout = 8000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const ignoreMissionBroadcasts = (room) => {
  for (const type of ["interlockAck", "bombDefused", "bombDetonated", "missionComplication", "moduleSolved", "crisisResolved", "rolesAssigned", "boardAdvanced"]) {
    room.onMessage(type, () => {});
  }
};

const roomForRole = (rooms, role) => rooms.find((room) => room.state.players.get(room.sessionId)?.role === role);

const solveBoard = async (rooms, solo = false) => {
  const mission = rooms[0].state;
  const boardNumber = mission.boardNumber;
  const analyst = solo ? rooms[0] : roomForRole(rooms, "analyst");
  const technician = solo ? rooms[0] : roomForRole(rooms, "technician");
  const operator = solo ? rooms[0] : roomForRole(rooms, "operator");
  if (!analyst || !technician || !operator) throw new Error("Randomized role assignment did not produce three unique stations");

  analyst.send("puzzleAction", { action: "radar", value: mission.radarContact });
  await waitFor(() => rooms.every((room) => room.state.radarSolved), `board ${boardNumber} radar`);
  analyst.send("puzzleAction", { action: "frequency", value: mission.targetFrequency });
  await waitFor(() => rooms.every((room) => room.state.frequencySolved), `board ${boardNumber} frequency`);
  analyst.send("puzzleAction", { action: "pattern", value: mission.patternTarget.split("") });
  await waitFor(() => rooms.every((room) => room.state.patternSolved), `board ${boardNumber} pattern`);

  const relays = { relay1: mission.relay1Target, relay2: mission.relay2Target };
  technician.send("puzzleAction", { action: "relaySet", value: relays });
  technician.send("puzzleAction", { action: "relay", value: relays });
  await waitFor(() => rooms.every((room) => room.state.relaySolved), `board ${boardNumber} relay`);

  operator.send("puzzleAction", { action: "auth", value: mission.authCode });
  await waitFor(() => rooms.every((room) => room.state.authSolved), `board ${boardNumber} authorization`);
  operator.send("puzzleAction", { action: "order", value: mission.orderTarget });
  await waitFor(() => rooms.every((room) => room.state.orderSolved), `board ${boardNumber} standing order`);
  for (const id of mission.safeWireIds.split("")) technician.send("puzzleAction", { action: "wire", value: id });
  await waitFor(() => rooms.every((room) => mission.safeWireIds.split("").every((id) => room.state.cutWireIds.includes(id))), `board ${boardNumber} wires`);

  analyst.send("puzzleAction", { action: "ack", value: "analyst" });
  technician.send("puzzleAction", { action: "ack", value: "technician" });
  operator.send("puzzleAction", { action: "ack", value: "operator" });
  await waitFor(() => rooms.every((room) => room.state.isGameOver || room.state.boardNumber > boardNumber), `board ${boardNumber} completion`);
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
  const leaderboard = await fetch("http://127.0.0.1:2567/api/tri-fusal/leaderboard?difficulty=HARD").then((response) => response.json());
  if (!leaderboard.entries?.some((entry) => entry.operation === operation)) throw new Error("Completed mission missing from leaderboard");
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
  await solveBoard(fallbackRooms, true);
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
