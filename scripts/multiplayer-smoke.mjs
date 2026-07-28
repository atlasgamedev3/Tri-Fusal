import { Client } from "../client/node_modules/colyseus.js/build/esm/index.mjs";

const client = new Client("ws://127.0.0.1:2567");
const operation = `SMOKE-${Date.now()}`;
const roles = ["analyst", "technician", "operator"];
const rooms = [];

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
      difficulty: "STANDARD",
    };
    rooms.push(index === 0
      ? await client.create("tri_fusal", options)
      : await client.join("tri_fusal", options));
  }

  await waitFor(() => rooms.every((room) => room.state.players.size === 3), "three synchronized players");
  rooms[0].send("startMission");
  await waitFor(() => rooms.every((room) => room.state.gameStarted), "mission start");

  rooms[0].send("puzzleAction", { action: "frequency", value: 156.8 });
  await waitFor(() => rooms.every((room) => room.state.frequencySolved), "frequency handoff");
  rooms[0].send("puzzleAction", { action: "pattern", value: ["△", "○", "□", "○"] });
  await waitFor(() => rooms.every((room) => room.state.patternSolved), "pattern handoff");
  rooms[2].send("puzzleAction", { action: "auth", value: "DELTA-7-ECHO" });
  await waitFor(() => rooms.every((room) => room.state.authSolved), "authorization handoff");
  rooms[2].send("puzzleAction", { action: "order", value: "B" });
  await waitFor(() => rooms.every((room) => room.state.orderSolved), "standing order handoff");
  rooms[1].send("puzzleAction", { action: "wire", value: "B" });
  await waitFor(() => rooms.every((room) => room.state.cutWireIds.includes("B")), "safe wire isolation");
  rooms[1].send("puzzleAction", { action: "relaySet", value: { relay1: true, relay2: true } });
  rooms[1].send("puzzleAction", { action: "relay", value: { relay1: true, relay2: true } });
  await waitFor(() => rooms.every((room) => room.state.relaySolved), "relay handoff");
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
  difficulty: "STANDARD",
  soloDemo: true,
});

try {
  await waitFor(() => solo.state.players?.size === 3, "solo demo operatives");
  solo.send("startMission");
  await waitFor(() => solo.state.gameStarted, "solo mission start");
  solo.send("puzzleAction", { action: "frequency", value: 156.8 });
  await waitFor(() => solo.state.frequencySolved, "solo frequency handoff");
  solo.send("puzzleAction", { action: "pattern", value: ["△", "○", "□", "○"] });
  await waitFor(() => solo.state.patternSolved, "solo pattern handoff");
  solo.send("puzzleAction", { action: "auth", value: "DELTA-7-ECHO" });
  await waitFor(() => solo.state.authSolved, "solo authorization handoff");
  solo.send("puzzleAction", { action: "order", value: "B" });
  await waitFor(() => solo.state.orderSolved, "solo standing order handoff");
  solo.send("puzzleAction", { action: "wire", value: "B" });
  await waitFor(() => solo.state.cutWireIds.includes("B"), "solo safe wire isolation");
  solo.send("puzzleAction", { action: "relaySet", value: { relay1: true, relay2: true } });
  solo.send("puzzleAction", { action: "relay", value: { relay1: true, relay2: true } });
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
