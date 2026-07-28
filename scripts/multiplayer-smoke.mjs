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
  rooms[0].send("puzzleAction", { action: "pattern", value: ["△", "○", "□", "○"] });
  rooms[1].send("puzzleAction", { action: "wire", value: "A" });
  rooms[1].send("puzzleAction", { action: "wire", value: "B" });
  rooms[1].send("puzzleAction", { action: "wire", value: "C" });
  rooms[2].send("puzzleAction", { action: "auth", value: "DELTA-7-ECHO" });

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
  solo.send("puzzleAction", { action: "pattern", value: ["△", "○", "□", "○"] });
  solo.send("puzzleAction", { action: "wire", value: "A" });
  solo.send("puzzleAction", { action: "wire", value: "B" });
  solo.send("puzzleAction", { action: "wire", value: "C" });
  solo.send("puzzleAction", { action: "auth", value: "DELTA-7-ECHO" });
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
