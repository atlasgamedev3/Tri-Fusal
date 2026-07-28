import { Client, Room } from "colyseus";
import { MissionPlayer, MissionRole, MissionState } from "../schema/MissionState";

const ROLE_SET = new Set<MissionRole>(["analyst", "technician", "operator"]);
const DIFFICULTY_SECONDS: Record<string, number> = { STANDARD: 540, HARD: 450, EXTREME: 360 };
const REQUIRED_PUZZLES: Record<string, number> = { STANDARD: 7, HARD: 7, EXTREME: 7 };
const SAFE_WIRES = new Set(["B", "D"]);
const WIRES_PER_DIFFICULTY: Record<string, number> = { STANDARD: 3, HARD: 5, EXTREME: 7 };
const ROLE_ACTIONS: Record<MissionRole, Set<string>> = {
  analyst: new Set(["frequency", "pattern", "ack"]),
  technician: new Set(["relay", "relaySet", "wire", "ack"]),
  operator: new Set(["auth", "order", "ack"]),
};

function makeBombId() {
  const words = ["ALPHA", "ECHO", "KILO", "OSCAR", "TANGO", "ZULU"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
}

export class TriFusalRoom extends Room<MissionState> {
  maxClients = 3;
  private timer: ReturnType<typeof setInterval> | null = null;
  private userRoles = new Map<string, MissionRole>();
  private isSoloDemo = false;

  onCreate(options: Record<string, unknown>) {
    this.autoDispose = false;
    this.setState(new MissionState());
    const requestedDifficulty = String(options.difficulty || "STANDARD").toUpperCase();
    this.state.difficulty = DIFFICULTY_SECONDS[requestedDifficulty] ? requestedDifficulty : "STANDARD";
    this.resetMission();

    this.onMessage("setDifficulty", (client, message: { difficulty?: string }) => {
      const player = this.state.players.get(client.sessionId);
      const difficulty = String(message.difficulty || "").toUpperCase();
      if (!player || player.userId !== this.state.hostUserId || this.state.gameStarted || !DIFFICULTY_SECONDS[difficulty]) return;
      this.state.difficulty = difficulty;
      this.resetMission();
    });

    this.onMessage("startMission", (client) => {
      if (this.state.gameStarted || this.state.players.size !== 3) {
        client.send("missionRejected", { reason: "All three roles must be claimed before deployment." });
        return;
      }
      this.state.gameStarted = true;
      this.state.bombStatus = "running";
      void this.setPrivate(true);
      this.startTimer();
    });

    this.onMessage("simulateOutcome", (client, message: { outcome?: string }) => {
      if (!this.isSoloDemo || !this.state.gameStarted || this.state.isGameOver) return;
      if (!this.state.players.has(client.sessionId)) return;
      this.finish(message.outcome === "detonated" ? "detonated" : "defused");
    });

    this.onMessage("puzzleAction", (client, message: { action?: string; value?: unknown }) => {
      if (!this.canAct(client, message.action)) return;
      const player = this.state.players.get(client.sessionId)!;
      const action = String(message.action);
      let failedReason = "";
      let lockedReason = "";

      if (action === "frequency") {
        const value = Math.max(140, Math.min(170, Number(message.value)));
        if (!Number.isFinite(value)) return;
        this.state.frequency = Math.round(value * 10) / 10;
        this.state.frequencySolved = Math.abs(this.state.frequency - 156.8) < 0.6;
      } else if (action === "pattern") {
        if (!this.state.frequencySolved) lockedReason = "ANALYST DECODER LOCKED — ACQUIRE TARGET FREQUENCY FIRST";
        else {
          const value = Array.isArray(message.value) ? message.value.join("") : String(message.value || "");
          if (value === "△○□○") this.state.patternSolved = true;
          else failedReason = "SIGNAL PATTERN MISMATCH";
        }
      } else if (action === "auth") {
        if (!this.state.patternSolved) lockedReason = "OPERATOR AUTH CHANNEL LOCKED — AWAIT ANALYST PATTERN";
        else if (String(message.value || "").trim().toUpperCase() === "DELTA-7-ECHO") this.state.authSolved = true;
        else failedReason = "INVALID AUTH CODE";
      } else if (action === "relaySet") {
        if (!this.state.patternSolved) {
          client.send("puzzleLocked", { reason: "RELAY BANK LOCKED — AWAIT ANALYST PATTERN" });
          return;
        }
        const value = message.value as { relay1?: boolean; relay2?: boolean };
        this.state.relay1 = Boolean(value?.relay1);
        this.state.relay2 = Boolean(value?.relay2);
      } else if (action === "relay") {
        if (!this.isWireSolved()) lockedReason = "RELAY COMMIT LOCKED — SAFE CIRCUITS MUST BE ISOLATED";
        else {
          const value = message.value as { relay1?: boolean; relay2?: boolean };
          this.state.relay1 = Boolean(value?.relay1);
          this.state.relay2 = Boolean(value?.relay2);
          if (this.state.relay1 === this.state.frequencySolved && this.state.relay2 === this.state.patternSolved) {
            this.state.relaySolved = true;
          } else {
            failedReason = "RELAY SYNC FAULT";
          }
        }
      } else if (action === "order") {
        if (!this.state.authSolved) lockedReason = "STANDING ORDER SEALED — COMPLETE AUTHORIZATION FIRST";
        else if (String(message.value) === "B") this.state.orderSolved = true;
        else failedReason = "INCORRECT STANDING ORDER";
      } else if (action === "wire") {
        if (!this.state.orderSolved) lockedReason = "WIRE ACCESS LOCKED — AWAIT OPERATOR STANDING ORDER";
        else {
          const id = String(message.value || "").toUpperCase();
          const allowedIds = ["A", "B", "C", "D", "E", "F", "G"].slice(0, WIRES_PER_DIFFICULTY[this.state.difficulty]);
          if (!allowedIds.includes(id) || this.state.cutWireIds.includes(id)) return;
          this.state.cutWireIds.push(id);
          if (!SAFE_WIRES.has(id)) failedReason = `CIRCUIT ${id} DETONATOR TRIGGERED`;
        }
      } else if (action === "ack") {
        if (!this.areCorePuzzlesSolved()) lockedReason = "FINAL TRI-LOCK SEALED — COMPLETE ALL SIX CORE OBJECTIVES";
        else {
          const requestedRole = String(message.value || "") as MissionRole;
          const ackRole = this.isSoloDemo && ROLE_SET.has(requestedRole) ? requestedRole : player.role;
          if (ackRole === "analyst") this.state.analystAck = true;
          if (ackRole === "technician") this.state.technicianAck = true;
          if (ackRole === "operator") this.state.operatorAck = true;
          this.state.interlockSolved = this.state.analystAck && this.state.technicianAck && this.state.operatorAck;
          this.broadcast("interlockAck", { role: ackRole, timestamp: Date.now() });
        }
      }

      if (lockedReason) {
        client.send("puzzleLocked", { reason: lockedReason });
        return;
      }
      if (failedReason) this.applyPenalty(player, failedReason);
      this.updateProgress();
    });

    this.onMessage("comms", (client, message: { text?: string }) => {
      const player = this.state.players.get(client.sessionId);
      const text = String(message.text || "").trim().slice(0, 240);
      if (!player || !text) return;
      this.broadcast("comms", { from: player.role, text, timestamp: Date.now() });
    });

    this.onMessage("voiceSignal", (client, message: { target?: string; data?: unknown }) => {
      if (!this.state.players.has(client.sessionId)) return;
      const targetId = String(message.target || "");
      const target = this.clients.find((candidate) => candidate.sessionId === targetId);
      if (!target || !message.data) return;
      target.send("voiceSignal", { from: client.sessionId, data: message.data });
    });
  }

  onJoin(client: Client, options: Record<string, unknown>) {
    const role = String(options.role || "") as MissionRole;
    const userId = String(options.userId || client.sessionId);
    if (!ROLE_SET.has(role)) throw new Error("A valid mission role is required.");

    const existingRole = this.userRoles.get(userId);
    if (this.state.gameStarted && existingRole !== role) throw new Error("Mission already in progress.");

    let oldSessionId: string | undefined;
    this.state.players.forEach((player, sessionId) => {
      if (player.userId === userId) oldSessionId = sessionId;
      else if (player.role === role) throw new Error(`${role.toUpperCase()} is already claimed.`);
    });
    if (oldSessionId) this.state.players.delete(oldSessionId);

    const player = new MissionPlayer();
    player.sessionId = client.sessionId;
    player.userId = userId;
    player.name = String(options.playerName || "").trim().slice(0, 24) || role.toUpperCase();
    player.role = role;
    player.connected = true;
    this.state.players.set(client.sessionId, player);
    this.userRoles.set(userId, role);
    if (!this.state.hostUserId) this.state.hostUserId = userId;

    if (Boolean(options.soloDemo) && this.state.players.size === 1 && !this.state.gameStarted) {
      this.isSoloDemo = true;
      this.addDemoPlayer("technician", "BRIDGE");
      this.addDemoPlayer("operator", "SABLE");
      void this.setPrivate(true);
    }
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.isSoloDemo) {
      void this.disconnect();
      return;
    }
    if (consented) {
      player.connected = false;
      if (!this.state.gameStarted) {
        this.userRoles.delete(player.userId);
        this.state.players.delete(client.sessionId);
        if (this.state.hostUserId === player.userId) {
          this.state.hostUserId = this.state.players.values().next().value?.userId || "";
        }
        if (this.state.players.size === 0) void this.disconnect();
      }
      return;
    }

    player.connected = false;
    try {
      await this.allowReconnection(client, 120);
      player.connected = true;
    } catch {
      player.connected = false;
    }
  }

  onDispose() {
    if (this.timer) clearInterval(this.timer);
  }

  private canAct(client: Client, action?: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.state.gameStarted || this.state.isGameOver || this.state.bombStatus !== "running") return false;
    if (this.isSoloDemo) return ["frequency", "pattern", "relaySet", "relay", "wire", "auth", "order", "ack"].includes(String(action));
    return ROLE_ACTIONS[player.role].has(String(action));
  }

  private addDemoPlayer(role: MissionRole, name: string) {
    const player = new MissionPlayer();
    player.sessionId = `demo-${role}`;
    player.userId = `demo-${role}`;
    player.name = name;
    player.role = role;
    player.connected = true;
    this.state.players.set(player.sessionId, player);
  }

  private resetMission() {
    this.state.bombId = makeBombId();
    this.state.seconds = DIFFICULTY_SECONDS[this.state.difficulty];
    this.state.requiredPuzzleCount = REQUIRED_PUZZLES[this.state.difficulty];
    this.state.bombStatus = "ready";
  }

  private startTimer() {
    this.timer = setInterval(() => {
      this.state.seconds = Math.max(0, this.state.seconds - 1);
      if (this.state.seconds === 0) this.finish("detonated");
    }, 1000);
  }

  private applyPenalty(player: MissionPlayer, reason: string) {
    this.state.seconds = Math.max(0, this.state.seconds - 15);
    this.broadcast("penalty", { from: player.role, reason, seconds: 15, timestamp: Date.now() });
    if (this.state.seconds === 0) this.finish("detonated");
  }

  private updateProgress() {
    const base = [
      this.state.frequencySolved,
      this.state.patternSolved,
      this.state.authSolved,
      this.state.orderSolved,
      this.isWireSolved(),
      this.state.relaySolved,
      this.state.interlockSolved,
    ];
    this.state.solvedPuzzleCount = base.filter(Boolean).length;
    if (this.state.solvedPuzzleCount >= this.state.requiredPuzzleCount) this.finish("defused");
  }

  private isWireSolved() {
    const allowedIds = ["A", "B", "C", "D", "E", "F", "G"].slice(0, WIRES_PER_DIFFICULTY[this.state.difficulty]);
    const safeWireIds = allowedIds.filter((id) => SAFE_WIRES.has(id));
    return safeWireIds.every((id) => this.state.cutWireIds.includes(id));
  }

  private areCorePuzzlesSolved() {
    return this.state.frequencySolved
      && this.state.patternSolved
      && this.state.authSolved
      && this.state.orderSolved
      && this.isWireSolved()
      && this.state.relaySolved;
  }

  private finish(status: "defused" | "detonated") {
    if (this.state.isGameOver) return;
    this.state.bombStatus = status;
    this.state.isGameOver = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.broadcast(status === "defused" ? "bombDefused" : "bombDetonated", { seconds: this.state.seconds });
    this.clock.setTimeout(() => void this.disconnect(), 30_000);
  }
}
