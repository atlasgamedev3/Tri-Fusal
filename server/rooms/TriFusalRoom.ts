import { Client, Room } from "colyseus";
import { MissionPlayer, MissionRole, MissionState } from "../schema/MissionState";

const ROLE_SET = new Set<MissionRole>(["analyst", "technician", "operator"]);
const DIFFICULTY_SECONDS: Record<string, number> = { STANDARD: 540, HARD: 450, EXTREME: 360 };
const WIRES_PER_DIFFICULTY: Record<string, number> = { STANDARD: 3, HARD: 5, EXTREME: 7 };
const SAFE_WIRE_COUNT: Record<string, number> = { STANDARD: 1, HARD: 2, EXTREME: 3 };
const RADAR_TOLERANCE: Record<string, number> = { STANDARD: 10, HARD: 6, EXTREME: 3 };
const CUT_WINDOW_SECONDS: Record<string, number> = { STANDARD: 18, HARD: 12, EXTREME: 8 };
const MINOR_PENALTY_SECONDS = 30;
const BOARDS_PER_DIFFICULTY: Record<string, number> = { STANDARD: 1, HARD: 2, EXTREME: 3 };
const RELAY_REQUIRED: Record<string, boolean> = { STANDARD: false, HARD: true, EXTREME: true };
const ROLE_ACTIONS: Record<MissionRole, Set<string>> = {
  analyst: new Set(["radar", "frequency", "pattern"]),
  technician: new Set(["relay", "relaySet", "wire"]),
  operator: new Set(["auth", "order"]),
};

const MISSION_LOCATIONS = [
  { name: "NIGHT GLASS", lat: "51°30.7'N", lon: "000°07.4'W", grid: "LD-3184" },
  { name: "IRON ECHO", lat: "52°31.1'N", lon: "013°24.3'E", grid: "BR-6209" },
  { name: "PALE COMET", lat: "48°51.4'N", lon: "002°21.1'E", grid: "PS-4517" },
  { name: "RED MERIDIAN", lat: "47°22.4'N", lon: "015°07.2'E", grid: "BN-7742" },
  { name: "SABLE STAR", lat: "59°19.8'N", lon: "018°04.1'E", grid: "SK-9086" },
  { name: "COLD LANTERN", lat: "41°54.0'N", lon: "012°29.0'E", grid: "RM-2651" },
] as const;
const AUTH_PREFIXES = ["ORBIT", "EMBER", "VIOLET", "DELTA", "FROST", "CINDER", "NIGHT", "SABLE", "IRON", "PALE"] as const;
const AUTH_SUFFIXES = ["ALPHA", "ECHO", "KILO", "LIMA", "NOVEMBER", "ROMEO", "SIERRA", "TANGO", "VICTOR", "ZULU"] as const;

export interface TriFusalLeaderboardEntry {
  operation: string;
  difficulty: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  score: number;
  strikes: number;
  completedAt: string;
}

const TRI_FUSAL_LEADERBOARD: TriFusalLeaderboardEntry[] = [];

export function getTriFusalLeaderboard() {
  return [...TRI_FUSAL_LEADERBOARD];
}

function makeBombId() {
  const words = ["ALPHA", "ECHO", "KILO", "OSCAR", "TANGO", "ZULU"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
}

function shuffled<T>(values: readonly T[]) {
  return [...values].sort(() => Math.random() - 0.5);
}

function randomItem<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)];
}

function generateFrequency() {
  return (1420 + Math.floor(Math.random() * 261)) / 10;
}

function generateCipherCode() {
  return Array.from({ length: 4 }, () => String(1 + Math.floor(Math.random() * 4))).join("-");
}

function generateAuthCode() {
  return `${randomItem(AUTH_PREFIXES)}-${1 + Math.floor(Math.random() * 9)}-${randomItem(AUTH_SUFFIXES)}`;
}

export class TriFusalRoom extends Room<MissionState> {
  maxClients = 3;
  private timer: ReturnType<typeof setInterval> | null = null;
  private userRoles = new Map<string, MissionRole>();
  private isSoloDemo = false;
  private operation = "BLACKTHORN";

  onCreate(options: Record<string, unknown>) {
    this.autoDispose = false;
    this.setState(new MissionState());
    const requestedDifficulty = String(options.difficulty || "STANDARD").toUpperCase();
    this.state.difficulty = DIFFICULTY_SECONDS[requestedDifficulty] ? requestedDifficulty : "STANDARD";
    this.operation = String(options.operation || "BLACKTHORN").trim().toUpperCase().slice(0, 32) || "BLACKTHORN";
    this.resetMission();

    this.onMessage("setDifficulty", (client, message: { difficulty?: string }) => {
      const player = this.state.players.get(client.sessionId);
      const difficulty = String(message.difficulty || "").toUpperCase();
      if (!player || player.userId !== this.state.hostUserId || this.state.gameStarted || !DIFFICULTY_SECONDS[difficulty]) return;
      this.state.difficulty = difficulty;
      this.resetMission();
    });

    this.onMessage("startMission", (client) => {
      if (this.state.gameStarted || this.state.players.size < 2) {
        client.send("missionRejected", { reason: "At least two operatives are required before deployment." });
        return;
      }
      this.state.gameStarted = true;
      this.state.bombStatus = "running";
      void this.setPrivate(true);
      this.startTimer();
    });

    this.onMessage("simulateOutcome", (client, message: { outcome?: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.userId !== this.state.hostUserId || !this.state.gameStarted || this.state.isGameOver) return;
      this.finish(message.outcome === "detonated" ? "detonated" : "defused");
    });

    this.onMessage("puzzleAction", (client, message: { action?: string; value?: unknown }) => {
      if (!this.canAct(client, message.action)) return;
      const player = this.state.players.get(client.sessionId)!;
      const action = String(message.action || "");
      let failedReason = "";
      let failedSeverity: "minor" | "major" | null = null;
      let lockedReason = "";

      if (action === "radar") {
        const contact = String(message.value || "").toUpperCase();
        if (!["TGT-01", "TGT-02", "UNK-A"].includes(contact)) return;
        this.state.radarSelection = contact;
        this.state.radarSolved = contact === this.state.radarContact;
        if (this.state.radarSolved) {
          this.announceModule("TARGET CONTACT IDENTIFIED", player.role);
        } else {
          failedReason = "INCORRECT TARGET CONTACT";
          failedSeverity = "minor";
        }
      } else if (action === "frequency") {
        if (!this.state.radarSolved) {
          lockedReason = "TUNER LOCKED — CONFIRM THE TARGET CONTACT FIRST";
        } else {
          const value = Math.max(140, Math.min(170, Number(message.value)));
          if (!Number.isFinite(value)) return;
          const wasSolved = this.state.frequencySolved;
          this.state.frequency = Math.round(value * 10) / 10;
          this.state.frequencySolved = Math.abs(this.state.frequency - this.state.targetFrequency) < 0.06;
          if (!wasSolved && this.state.frequencySolved) this.announceModule("TARGET CARRIER LOCKED", player.role);
        }
      } else if (action === "pattern") {
        if (!this.state.frequencySolved) {
          lockedReason = "DECODER LOCKED — ACQUIRE THE TARGET FREQUENCY FIRST";
        } else if (!this.state.patternSolved) {
          const value = Array.isArray(message.value) ? message.value.join("") : String(message.value || "");
          if (value === this.state.patternTarget) {
            this.state.patternSolved = true;
            this.announceModule("INTEL PACKET DECODED", player.role);
          }
        }
      } else if (action === "auth") {
        if (!this.state.patternSolved) {
          lockedReason = "AUTH CHANNEL LOCKED — AWAIT ANALYST INTEL";
        } else if (!this.state.authSolved) {
          const attempt = String(message.value || "").trim().toUpperCase();
          if (attempt === this.state.authCode) {
            this.state.authSolved = true;
            this.announceModule("AUTHORIZATION ACCEPTED", player.role);
          } else {
            failedReason = "INVALID AUTH CODE";
            failedSeverity = "minor";
          }
        }
      } else if (action === "order") {
        if (!this.state.authSolved) {
          lockedReason = "CUT PROTOCOL SEALED — COMPLETE AUTHORIZATION FIRST";
        } else if (!this.state.orderSolved) {
          const choice = String(message.value || "").toUpperCase();
          if (choice === this.state.orderTarget) {
            this.state.orderSolved = true;
            this.announceModule("CUT PROTOCOL VALIDATED", player.role);
            if (this.isRelayRequired()) {
              this.broadcast("missionComplication", {
                text: `CUT PROTOCOL ${this.state.orderTarget} CLEARED — STABILIZER ALIGNMENT REQUIRED`,
                timestamp: Date.now(),
              });
            } else {
              this.openCutWindow();
            }
          } else {
            failedReason = "INCORRECT CUT PROTOCOL";
            failedSeverity = "minor";
          }
        }
      } else if (action === "relaySet") {
        if (!this.isRelayRequired()) {
          lockedReason = "STANDARD LOADOUT — STABILIZER BYPASS ACTIVE";
        } else if (!this.state.orderSolved) {
          lockedReason = "STABILIZER SEALED — AWAIT OPERATOR CUT PROTOCOL";
        } else {
          const value = message.value as { relay1?: boolean; relay2?: boolean };
          this.state.relay1 = Boolean(value?.relay1);
          this.state.relay2 = Boolean(value?.relay2);
        }
      } else if (action === "relay") {
        if (!this.isRelayRequired()) {
          lockedReason = "STANDARD LOADOUT — STABILIZER BYPASS ACTIVE";
        } else if (!this.state.orderSolved) {
          lockedReason = "STABILIZER SEALED — AWAIT OPERATOR CUT PROTOCOL";
        } else {
          const value = message.value as { relay1?: boolean; relay2?: boolean };
          this.state.relay1 = Boolean(value?.relay1);
          this.state.relay2 = Boolean(value?.relay2);
          if (this.state.relay1 === this.state.relay1Target && this.state.relay2 === this.state.relay2Target) {
            if (!this.state.relaySolved) this.announceModule("STABILIZER ALIGNED", player.role);
            this.state.relaySolved = true;
            this.openCutWindow();
          } else {
            this.state.relaySolved = false;
            this.state.relay1 = false;
            this.state.relay2 = true;
            failedReason = "STABILIZER ALIGNMENT FAILED";
            failedSeverity = "major";
          }
        }
      } else if (action === "wire") {
        const id = String(message.value || "").toUpperCase();
        const allowedIds = ["A", "B", "C", "D", "E", "F", "G"].slice(0, WIRES_PER_DIFFICULTY[this.state.difficulty]);
        if (!allowedIds.includes(id) || this.state.cutWireIds.includes(id)) return;
        if (!this.state.orderSolved) {
          lockedReason = "CUT PROTOCOL LOCKED — AWAIT OPERATOR AUTHORIZATION";
        } else if (this.isRelayRequired() && !this.state.relaySolved) {
          lockedReason = "STABILIZER REQUIRED — ALIGN BOTH BANKS FIRST";
        } else if (!this.state.relayWindowActive) {
          lockedReason = this.isRelayRequired()
            ? "CUT WINDOW CLOSED — RESTABILIZE THE DEVICE"
            : "CUT WINDOW CLOSED — OPERATOR MUST REAUTHORIZE";
        } else {
          this.state.cutWireIds.push(id);
          if (!this.state.safeWireIds.includes(id)) {
            this.resetCutStage();
            failedReason = `WIRE ${id} WAS NOT THE DESIGNATED TARGET`;
            failedSeverity = "major";
          } else {
            if (this.isWireSolved()) {
              this.state.relayWindowActive = false;
              this.state.relayWindow = 0;
              this.announceModule(this.state.safeWireIds.length === 1 ? "TARGET WIRE SEVERED" : "TARGET WIRES SEVERED", player.role);
            }
          }
        }
      }

      if (lockedReason) {
        client.send("puzzleLocked", { reason: lockedReason });
        return;
      }
      if (failedReason) this.applyPenalty(player.role, failedReason, failedSeverity || "minor");
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
    if (this.isSoloDemo || this.state.players.size === 2) {
      return ["radar", "frequency", "pattern", "relaySet", "relay", "wire", "auth", "order"].includes(String(action));
    }
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

  private resetMission(preserveRun = false) {
    const preservedSeconds = this.state.seconds;
    const preservedStrikes = this.state.strikes;
    const preservedBoardNumber = this.state.boardNumber;
    const location = randomItem(MISSION_LOCATIONS);
    const radarContact = randomItem(["TGT-01", "TGT-02", "UNK-A"] as const);
    const targetFrequency = generateFrequency();
    const patternCode = generateCipherCode();
    const authCode = generateAuthCode();
    const orderTarget = randomItem(["A", "B", "C"] as const);
    const wireCount = WIRES_PER_DIFFICULTY[this.state.difficulty];
    const safeCount = SAFE_WIRE_COUNT[this.state.difficulty];
    const availableWireIds = ["A", "B", "C", "D", "E", "F", "G"].slice(0, wireCount);
    const safeWireIds = [...availableWireIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, safeCount)
      .sort()
      .join("");
    const radarRules = this.state.difficulty === "STANDARD" ? ["WINDOW", "NEAREST"] : ["WINDOW", "NEAREST", "FARTHEST"];
    const radarRule = shuffled(radarRules)[0];
    const radarTolerance = RADAR_TOLERANCE[this.state.difficulty];
    const targetBearing = 20 + Math.floor(Math.random() * 321);
    const decoyBearings = shuffled([
      (targetBearing + 70 + Math.floor(Math.random() * 50)) % 360,
      (targetBearing + 190 + Math.floor(Math.random() * 50)) % 360,
    ]);
    const contactIds = ["TGT-01", "TGT-02", "UNK-A"];
    const targetIndex = contactIds.indexOf(radarContact);
    const bearings = contactIds.map((_, index) => (index === targetIndex ? targetBearing : decoyBearings.shift()!));
    const ranges = contactIds.map((_, index) => {
      if (radarRule === "NEAREST") return index === targetIndex ? 24 + Math.floor(Math.random() * 15) : 52 + Math.floor(Math.random() * 34);
      if (radarRule === "FARTHEST") return index === targetIndex ? 72 + Math.floor(Math.random() * 16) : 24 + Math.floor(Math.random() * 34);
      return 28 + Math.floor(Math.random() * 58);
    });
    const cipherMap = shuffled(["△", "○", "□", "◇"]);
    const cipherDirection = Math.random() >= 0.5 ? "LTR" : "RTL";
    const digits = patternCode.split("-");
    const decodedDigits = cipherDirection === "RTL" ? [...digits].reverse() : digits;
    const patternTarget = decodedDigits.map((digit) => cipherMap[Number(digit) - 1]).join("");
    const relay1Rule = shuffled(["HIGH_BAND", "MID_BAND", "TENTHS_ODD"])[0];
    const relay2Rule = shuffled(["SUM_EVEN", "ENDS_MATCH", "RISING_EDGE"])[0];
    const digitValues = digits.map(Number);
    const relay1Target = relay1Rule === "HIGH_BAND"
      ? targetFrequency >= 155
      : relay1Rule === "MID_BAND"
        ? targetFrequency >= 148 && targetFrequency <= 162
        : Math.round(targetFrequency * 10) % 2 === 1;
    const relay2Target = relay2Rule === "SUM_EVEN"
      ? digitValues.reduce((sum, digit) => sum + digit, 0) % 2 === 0
      : relay2Rule === "ENDS_MATCH"
        ? digitValues[0] === digitValues[digitValues.length - 1]
        : digitValues[digitValues.length - 1] > digitValues[0];
    const wireCodes = availableWireIds.map(() => String(1 + Math.floor(Math.random() * 9))).join("");

    this.state.bombId = makeBombId();
    this.state.seconds = DIFFICULTY_SECONDS[this.state.difficulty];
    this.state.missionVariant = location.name;
    this.state.radarContact = radarContact;
    this.state.radarLat = location.lat;
    this.state.radarLon = location.lon;
    this.state.radarGrid = location.grid;
    this.state.radarSelection = "";
    this.state.radarSolved = false;
    this.state.radarTargetBearing = targetBearing;
    this.state.radarBearing1 = bearings[0];
    this.state.radarBearing2 = bearings[1];
    this.state.radarBearing3 = bearings[2];
    this.state.radarRange1 = ranges[0];
    this.state.radarRange2 = ranges[1];
    this.state.radarRange3 = ranges[2];
    this.state.radarRule = radarRule;
    this.state.radarTolerance = radarTolerance;
    this.state.targetFrequency = targetFrequency;
    this.state.frequency = 144.5;
    this.state.patternCode = patternCode;
    this.state.patternTarget = patternTarget;
    this.state.cipherMap = cipherMap.join("");
    this.state.cipherDirection = cipherDirection;
    this.state.authCode = authCode;
    this.state.orderTarget = orderTarget;
    this.state.safeWireIds = safeWireIds;
    this.state.wireCodes = wireCodes;
    this.state.wireRule = "TARGET";
    this.state.relay1Target = relay1Target;
    this.state.relay2Target = relay2Target;
    this.state.relay1Rule = relay1Rule;
    this.state.relay2Rule = relay2Rule;
    this.state.relayWindowMax = CUT_WINDOW_SECONDS[this.state.difficulty];
    this.state.relayWindow = 0;
    this.state.relayWindowActive = false;
    this.state.frequencySolved = false;
    this.state.patternSolved = false;
    this.state.authSolved = false;
    this.state.relay1 = false;
    this.state.relay2 = true;
    this.state.relaySolved = false;
    this.state.orderSolved = false;
    this.state.analystAck = false;
    this.state.technicianAck = false;
    this.state.operatorAck = false;
    this.state.interlockSolved = false;
    this.state.cutWireIds.splice(0, this.state.cutWireIds.length);
    this.state.isGameOver = false;
    this.state.gameStarted = false;
    this.state.bombStatus = "ready";
    this.state.strikes = 0;
    this.state.crisisActive = false;
    this.state.crisisSeconds = 0;
    this.state.crisisCooldown = 0;
    if (preserveRun) {
      this.state.seconds = preservedSeconds;
      this.state.strikes = preservedStrikes;
      this.state.boardNumber = preservedBoardNumber;
      this.state.gameStarted = true;
      this.state.bombStatus = "running";
    } else {
      this.state.boardNumber = 1;
      this.state.boardCount = BOARDS_PER_DIFFICULTY[this.state.difficulty];
      this.state.score = 0;
    }
  }

  private startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.state.seconds = Math.max(0, this.state.seconds - 1);
      if (this.state.relayWindowActive) {
        this.state.relayWindow = Math.max(0, this.state.relayWindow - 1);
        if (this.state.relayWindow === 0) {
          this.resetCutStage();
          this.applyPenalty("system", "LIVE CUT WINDOW EXPIRED", "major");
          if (!this.state.isGameOver) {
            this.broadcast("missionComplication", {
              text: this.isRelayRequired()
                ? "CUT WINDOW LOST — RESTABILIZE THE DEVICE"
                : "CUT WINDOW LOST — OPERATOR MUST REAUTHORIZE",
              timestamp: Date.now(),
            });
          }
        }
      }
      if (this.state.seconds === 0) this.finish("detonated");
    }, 1000);
  }

  private announceModule(label: string, role: MissionRole) {
    this.broadcast("moduleSolved", { label, role, timestamp: Date.now() });
  }

  private isRelayRequired() {
    return RELAY_REQUIRED[this.state.difficulty];
  }

  private openCutWindow() {
    this.state.relayWindow = this.state.relayWindowMax;
    this.state.relayWindowActive = true;
    this.broadcast("missionComplication", {
      text: `CUT WINDOW OPEN — ACT WITHIN ${this.state.relayWindow}s`,
      timestamp: Date.now(),
    });
  }

  private resetCutStage() {
    this.state.relayWindowActive = false;
    this.state.relayWindow = 0;
    if (this.isRelayRequired()) {
      this.state.relaySolved = false;
      this.state.relay1 = false;
      this.state.relay2 = true;
    } else {
      this.state.orderSolved = false;
    }
  }

  private applyPenalty(role: MissionRole | "system", reason: string, severity: "minor" | "major" = "minor") {
    this.state.strikes += 1;
    const seconds = severity === "major"
      ? Math.max(1, Math.floor(DIFFICULTY_SECONDS[this.state.difficulty] / 3))
      : MINOR_PENALTY_SECONDS;
    this.state.seconds = Math.max(0, this.state.seconds - seconds);
    this.broadcast("penalty", { from: role, reason, seconds, strikes: this.state.strikes, maxStrikes: 3, timestamp: Date.now() });
    if (this.state.seconds === 0 || this.state.strikes >= 3) this.finish("detonated");
  }

  private updateProgress() {
    if (!this.isBoardSolved()) return;
    if (this.state.boardNumber < this.state.boardCount) {
      const completedBoard = this.state.boardNumber;
      this.state.boardNumber += 1;
      this.broadcast("boardAdvanced", {
        completedBoard,
        nextBoard: this.state.boardNumber,
        boardCount: this.state.boardCount,
        timestamp: Date.now(),
      });
      this.resetMission(true);
      return;
    }
    this.finish("defused");
  }

  private isWireSolved() {
    const safeWireIds = this.state.safeWireIds.split("").filter(Boolean);
    return safeWireIds.every((id) => this.state.cutWireIds.includes(id));
  }

  private isBoardSolved() {
    return this.state.radarSolved
      && this.state.frequencySolved
      && this.state.patternSolved
      && this.state.authSolved
      && this.state.orderSolved
      && (!this.isRelayRequired() || this.state.relaySolved)
      && this.isWireSolved();
  }

  private finish(status: "defused" | "detonated") {
    if (this.state.isGameOver) return;
    this.state.bombStatus = status;
    this.state.isGameOver = true;
    if (status === "defused") {
      const elapsedSeconds = Math.max(0, DIFFICULTY_SECONDS[this.state.difficulty] - this.state.seconds);
      const difficultyBonus = this.state.difficulty === "EXTREME" ? 5000 : this.state.difficulty === "HARD" ? 2500 : 1000;
      this.state.score = Math.max(0, this.state.seconds * 100 + difficultyBonus + this.state.boardCount * 1000 - this.state.strikes * 500);
      TRI_FUSAL_LEADERBOARD.push({
        operation: this.operation,
        difficulty: this.state.difficulty,
        elapsedSeconds,
        remainingSeconds: this.state.seconds,
        score: this.state.score,
        strikes: this.state.strikes,
        completedAt: new Date().toISOString(),
      });
      const topByDifficulty = new Map<string, TriFusalLeaderboardEntry[]>();
      for (const entry of TRI_FUSAL_LEADERBOARD) {
        const entries = topByDifficulty.get(entry.difficulty) || [];
        entries.push(entry);
        entries.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || b.score - a.score);
        topByDifficulty.set(entry.difficulty, entries.slice(0, 10));
      }
      TRI_FUSAL_LEADERBOARD.splice(0, TRI_FUSAL_LEADERBOARD.length, ...[...topByDifficulty.values()].flat());
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.broadcast(status === "defused" ? "bombDefused" : "bombDetonated", { seconds: this.state.seconds, score: this.state.score });
    this.clock.setTimeout(() => void this.disconnect(), 30_000);
  }
}
