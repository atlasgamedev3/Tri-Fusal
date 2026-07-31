import { Client } from "../client/node_modules/colyseus.js/build/esm/index.mjs";

const client = new Client("ws://127.0.0.1:2567");
const operation = `SMOKE-${Date.now()}`;
const roles = ["analyst", "technician", "operator"];
const rooms = [];
const ignoreMissionBroadcasts = (room) => {
  room.onMessage("interlockAck", () => {});
  room.onMessage("bombDefused", () => {});
  room.onMessage("bombDetonated", () => {});
  room.onMessage("missionComplication", () => {});
  room.onMessage("moduleSolved", () => {});
};

const waitFor = async (predicate, label, timeout = 5000) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

try {
  for (const [index, role] of roles.entries()) {
    const options = {
      operation,
      role,
      userId: `smoke-${role}-${Date.now()}`,
      playerName: role.toUpperCase(),
      difficulty: "HARD",
    };
    const room = index === 0
      ? await client.create("tri_fusal", options)
      : await client.join("tri_fusal", options);
    ignoreMissionBroadcasts(room);
    rooms.push(room);
  }

  await waitFor(() => rooms.every((room) => room.state.players.size === 3), "three synchronized players");
  rooms[0].send("startMission");
  await waitFor(() => rooms.every((room) => room.state.gameStarted), "mission start");

  const mission = rooms[0].state;
  rooms[0].send("puzzleAction", { action: "radar", value: mission.radarContact });
  await waitFor(() => rooms.every((room) => room.state.radarSolved), "radar designation handoff");
  rooms[0].send("puzzleAction", { action: "frequency", value: mission.targetFrequency });
  await waitFor(() => rooms.every((room) => room.state.frequencySolved), "frequency handoff");
  rooms[0].send("puzzleAction", { action: "pattern", value: mission.patternTarget.split("") });
  await waitFor(() => rooms.every((room) => room.state.patternSolved), "pattern handoff");
  const relays = { relay1: mission.relay1Target, relay2: mission.relay2Target };
  rooms[1].send("puzzleAction", { action: "relaySet", value: relays });
  rooms[1].send("puzzleAction", { action: "relay", value: relays });
  await waitFor(() => rooms.every((room) => room.state.relaySolved), "parallel relay handoff");
  rooms[2].send("puzzleAction", { action: "auth", value: mission.authCode });
  await waitFor(() => rooms.every((room) => room.state.authSolved), "authorization handoff");
  rooms[2].send("puzzleAction", { action: "order", value: mission.orderTarget });
  await waitFor(() => rooms.every((room) => room.state.orderSolved), "standing order handoff");
  for (const id of mission.safeWireIds.split("")) rooms[1].send("puzzleAction", { action: "wire", value: id });
  await waitFor(() => rooms.every((room) => mission.safeWireIds.split("").every((id) => room.state.cutWireIds.includes(id))), "safe wire isolation");
  rooms[0].send("puzzleAction", { action: "ack", value: "analyst" });
  rooms[1].send("puzzleAction", { action: "ack", value: "technician" });
  rooms[2].send("puzzleAction", { action: "ack", value: "operator" });

  await waitFor(() => rooms.every((room) => room.state.bombStatus === "defused"), "shared defusal");
  console.log(JSON.stringify({
    mode: "host-and-join",
    operation,
    players: rooms[0].state.players.size,
    status: rooms[0].state.bombStatus,
    solved: rooms[0].state.solvedPuzzleCount,
    required: rooms[0].state.requiredPuzzleCount,
    seconds: rooms[0].state.seconds,
  }));
} finally {
  await Promise.all(rooms.map((room) => room.leave()));
}

const soloOperation = `SOLO-${Date.now()}`;
const solo = await client.create("tri_fusal", {
  operation: soloOperation,
  role: "analyst",
  userId: `solo-smoke-${Date.now()}`,
  playerName: "WREN",
  difficulty: "EXTREME",
  soloDemo: true,
});
ignoreMissionBroadcasts(solo);

try {
  await waitFor(() => solo.state.players?.size === 3, "solo demo operatives");
  solo.send("startMission");
  await waitFor(() => solo.state.gameStarted, "solo mission start");
  const soloMission = solo.state;
  solo.send("puzzleAction", { action: "radar", value: soloMission.radarContact });
  await waitFor(() => solo.state.radarSolved, "solo radar designation handoff");
  solo.send("puzzleAction", { action: "frequency", value: soloMission.targetFrequency });
  await waitFor(() => solo.state.frequencySolved, "solo frequency handoff");
  solo.send("puzzleAction", { action: "pattern", value: soloMission.patternTarget.split("") });
  await waitFor(() => solo.state.patternSolved, "solo pattern handoff");
  solo.send("puzzleAction", { action: "auth", value: soloMission.authCode });
  await waitFor(() => solo.state.authSolved, "solo authorization handoff");
  solo.send("puzzleAction", { action: "order", value: soloMission.orderTarget });
  await waitFor(() => solo.state.orderSolved, "solo standing order handoff");
  for (const id of soloMission.safeWireIds.split("")) solo.send("puzzleAction", { action: "wire", value: id });
  await waitFor(() => soloMission.safeWireIds.split("").every((id) => solo.state.cutWireIds.includes(id)), "solo safe wire isolation");
  const soloRelays = { relay1: soloMission.relay1Target, relay2: soloMission.relay2Target };
  solo.send("puzzleAction", { action: "relaySet", value: soloRelays });
  solo.send("puzzleAction", { action: "relay", value: soloRelays });
  await waitFor(() => solo.state.relaySolved, "solo relay handoff");
  solo.send("puzzleAction", { action: "ack", value: "analyst" });
  solo.send("puzzleAction", { action: "ack", value: "technician" });
  solo.send("puzzleAction", { action: "ack", value: "operator" });
  await waitFor(() => solo.state.bombStatus === "defused", "solo shared-role defusal");
  console.log(JSON.stringify({
    mode: "solo-demo",
    operation: soloOperation,
    players: solo.state.players.size,
    status: solo.state.bombStatus,
    solved: solo.state.solvedPuzzleCount,
    required: solo.state.requiredPuzzleCount,
  }));
} finally {
  await solo.leave();
}
