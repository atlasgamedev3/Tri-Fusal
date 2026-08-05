import { Client, Room } from "colyseus";
import { MissionPlayer, MissionRole, MissionState } from "../schema/MissionState";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const ROLE_SET = new Set<MissionRole>(["analyst", "technician", "operator"]);
const DIFFICULTY_SECONDS: Record<string, number> = { STANDARD: 480, HARD: 390, EXTREME: 240 };
const WIRES_PER_DIFFICULTY: Record<string, number> = { STANDARD: 3, HARD: 5, EXTREME: 7 };
const SAFE_WIRE_COUNT: Record<string, number> = { STANDARD: 1, HARD: 2, EXTREME: 3 };
const RADAR_TOLERANCE: Record<string, number> = { STANDARD: 10, HARD: 6, EXTREME: 3 };
const CUT_WINDOW_SECONDS: Record<string, number> = { STANDARD: 18, HARD: 12, EXTREME: 8 };
const MINOR_PENALTY_SECONDS = 30;
const BOARDS_PER_DIFFICULTY: Record<string, number> = { STANDARD: 2, HARD: 3, EXTREME: 4 };
const RELAY_REQUIRED: Record<string, boolean> = { STANDARD: false, HARD: true, EXTREME: true };
const ROLE_ACTIONS: Record<MissionRole, Set<string>> = {
  analyst: new Set(["radar", "frequency", "analystCheck", "analystCheck2", "analystCheck3"]),
  technician: new Set(["relay", "relaySet", "wire", "calibration", "technicianCheck", "technicianCheck2"]),
  operator: new Set(["pattern", "auth", "verification", "operatorCheck2", "operatorCheck3", "order"]),
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
const LEADERBOARD_PATH = process.env.TRI_FUSAL_LEADERBOARD_PATH || join(process.cwd(), "data", "tri-fusal-leaderboard.json");

export interface TriFusalLeaderboardEntry {
  operation: string;
  difficulty: string;
  elapsedSeconds: number;
  remainingSeconds: number;
  score: number;
  strikes: number;
  completedAt: string;
  missionSeed: string;
  boards: number;
}

function loadLeaderboard(): TriFusalLeaderboardEntry[] {
  try {
    if (!existsSync(LEADERBOARD_PATH)) return [];
    const value = JSON.parse(readFileSync(LEADERBOARD_PATH, "utf8"));
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.operation === "string") : [];
  } catch (error) {
    console.warn("Unable to read Tri-Fusal leaderboard:", error);
    return [];
  }
}

function persistLeaderboard(entries: TriFusalLeaderboardEntry[]) {
  try {
    mkdirSync(dirname(LEADERBOARD_PATH), { recursive: true });
    writeFileSync(LEADERBOARD_PATH, JSON.stringify(entries, null, 2), "utf8");
  } catch (error) {
    console.error("Unable to persist Tri-Fusal leaderboard:", error);
  }
}

const TRI_FUSAL_LEADERBOARD: TriFusalLeaderboardEntry[] = loadLeaderboard();

export function getTriFusalLeaderboard() {
  return [...TRI_FUSAL_LEADERBOARD];
}

type RandomSource = () => number;

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): RandomSource {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeBombId(random: RandomSource = Math.random) {
  const words = ["ALPHA", "ECHO", "KILO", "OSCAR", "TANGO", "ZULU"];
  const word = words[Math.floor(random() * words.length)];
  return `${word}-${Math.floor(1000 + random() * 9000)}-${String.fromCharCode(65 + Math.floor(random() * 26))}`;
}

function shuffled<T>(values: readonly T[], random: RandomSource = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomItem<T>(values: readonly T[], random: RandomSource = Math.random) {
  return values[Math.floor(random() * values.length)];
}

function generateFrequency(random: RandomSource) {
  return (1420 + Math.floor(random() * 261)) / 10;
}

function generateCipherCode(random: RandomSource, length = 4) {
  let digits: string[] = [];
  do digits = Array.from({ length }, () => String(1 + Math.floor(random() * 4)));
  while (new Set(digits).size < 2 || digits.every((digit) => digit === digits[0]));
  return digits.join("-");
}

function applyReadOrder<T>(values: T[], mode: string) {
  if (mode === "RTL") return [...values].reverse();
  if (mode === "PAIRS") {
    const result = [...values];
    for (let i = 0; i + 1 < result.length; i += 2) [result[i], result[i + 1]] = [result[i + 1], result[i]];
    return result;
  }
  if (mode === "OUTSIDE") {
    const result: T[] = [];
    for (let left = 0, right = values.length - 1; left <= right; left += 1, right -= 1) {
      result.push(values[left]);
      if (right !== left) result.push(values[right]);
    }
    return result;
  }
  return [...values];
}

function generateAuthCode(random: RandomSource) {
  return `${randomItem(AUTH_PREFIXES, random)}-${1 + Math.floor(random() * 9)}-${randomItem(AUTH_SUFFIXES, random)}`;
}

export class TriFusalRoom extends Room<MissionState> {
  maxClients = 3;
  private timer: ReturnType<typeof setInterval> | null = null;
  private userRoles = new Map<string, MissionRole>();
  private isSoloDemo = false;
  private operation = "BLACKTHORN";
  private runSeed = "";
  private generation = 0;

  onCreate(options: Record<string, unknown>) {
    this.autoDispose = false;
    this.setState(new MissionState());
    const requestedDifficulty = String(options.difficulty || "STANDARD").toUpperCase();
    this.state.difficulty = DIFFICULTY_SECONDS[requestedDifficulty] ? requestedDifficulty : "STANDARD";
    this.operation = String(options.operation || "BLACKTHORN").trim().toUpperCase().slice(0, 32) || "BLACKTHORN";
    this.runSeed = String(options.seed || `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xFFFFFF).toString(36)}`).toUpperCase().slice(0, 32);
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
      this.state.runStartedAt = Date.now();
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
        const value = Math.max(140, Math.min(170, Number(message.value)));
        if (!Number.isFinite(value)) return;
        const wasSolved = this.state.frequencySolved;
        this.state.frequency = Math.round(value * 10) / 10;
        this.state.frequencySolved = Math.abs(this.state.frequency - this.state.targetFrequency) < 0.06;
        if (!wasSolved && this.state.frequencySolved) {
          this.announceModule("TARGET CARRIER LOCKED", player.role);
          if (this.boardProfile() === "SIGNAL") this.openCutWindow();
        }
      } else if (action === "analystCheck") {
        if (!this.state.radarSolved) {
          lockedReason = "ANALYSIS AUXILIARY LOCKED — IDENTIFY TARGET CONTACT FIRST";
        } else if ((this.state.crisisSeconds & 1) === 0) {
          const target = this.state.cipherMap.split("~")[2] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 1;
            this.announceModule("ANALYST AUXILIARY CLEARED", player.role);
          } else {
            failedReason = "ANALYST AUXILIARY CHECK FAILED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "analystCheck2") {
        if (!this.state.frequencySolved) {
          lockedReason = "SIGNATURE BAY LOCKED — ACQUIRE TARGET CARRIER FIRST";
        } else if ((this.state.crisisSeconds & 4) === 0) {
          const target = this.state.cipherMap.split("~")[4] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 4;
            this.announceModule("SIGNAL SIGNATURE CLASSIFIED", player.role);
          } else {
            failedReason = "SIGNAL SIGNATURE MISCLASSIFIED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "analystCheck3") {
        if (!this.state.frequencySolved) {
          lockedReason = "ANOMALY VIEWER LOCKED — ACQUIRE TARGET CARRIER FIRST";
        } else if ((this.state.crisisSeconds & 16) === 0) {
          const target = this.state.cipherMap.split("~")[8] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 16;
            this.announceModule("TRANSMISSION ANOMALY MARKED", player.role);
          } else {
            failedReason = "FALSE ANOMALY MARK";
            failedSeverity = "minor";
          }
        }
      } else if (action === "calibration") {
        if (!this.hasModule("CALIBRATION")) return;
        const value = Math.round(Number(message.value));
        if (!Number.isFinite(value)) return;
        const calibrationTarget = Number(this.state.authCode.split("|")[3]);
        if (value === calibrationTarget) {
          this.state.authSolved = true;
          this.announceModule("PRESSURE MANIFOLD BALANCED", player.role);
        } else {
          failedReason = "INCORRECT PRESSURE CALIBRATION";
          failedSeverity = "minor";
        }
      } else if (action === "technicianCheck") {
        if (!this.state.authSolved) {
          lockedReason = "DEVICE AUXILIARY LOCKED — BALANCE MANIFOLD FIRST";
        } else if ((this.state.crisisSeconds & 2) === 0) {
          const target = this.state.wireCodes.split("~")[2] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 2;
            this.announceModule("TECHNICIAN AUXILIARY CLEARED", player.role);
          } else {
            failedReason = "TECHNICIAN AUXILIARY CHECK FAILED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "technicianCheck2") {
        if (!this.state.authSolved) {
          lockedReason = "PATCH PANEL LOCKED — BALANCE MANIFOLD FIRST";
        } else if ((this.state.crisisSeconds & 64) === 0) {
          lockedReason = "PATCH PANEL LOCKED — AWAIT OPERATOR FIELD DISPATCH";
        } else if ((this.state.crisisSeconds & 32) === 0) {
          const target = this.state.wireCodes.split("~")[4] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 32;
            this.announceModule("PATCH ROUTE SEATED", player.role);
          } else {
            failedReason = "PATCH ROUTED TO WRONG JACK";
            failedSeverity = "minor";
          }
        }
      } else if (action === "pattern") {
        if (!this.state.frequencySolved && !this.hasModule("MATRIX")) {
          lockedReason = "DECODER LOCKED — ACQUIRE THE TARGET FREQUENCY FIRST";
        } else if (!this.state.patternSolved) {
          const value = Array.isArray(message.value) ? message.value.join("") : String(message.value || "");
          const digits = this.state.patternCode.split("-");
          const expected = this.hasModule("MATRIX") ? this.state.patternCode : applyReadOrder(digits, this.state.cipherDirection).join("");
          if (value === expected) {
            this.state.patternSolved = true;
            this.announceModule("INTEL PACKET DECODED", player.role);
          } else {
            failedReason = "INCORRECT INTEL BURST";
            failedSeverity = "minor";
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
        if (!this.state.relaySolved || (this.state.crisisSeconds & 8) === 0 || (this.state.crisisSeconds & 64) === 0 || (this.state.crisisSeconds & 32) === 0) {
          lockedReason = "CUT PROTOCOL LOCKED — COMPLETE THE ANALYST TO OPERATOR TO TECHNICIAN CHAIN";
        } else if (!this.state.orderSolved) {
          const choice = String(message.value || "").toUpperCase();
          const protocolTarget = this.state.orderTarget.split("|")[0];
          if (choice === protocolTarget) {
            this.state.orderSolved = true;
            this.announceModule("CUT PROTOCOL VALIDATED", player.role);
            if (this.isRelayRequired()) {
              this.broadcast("missionComplication", {
                text: `CUT PROTOCOL ${protocolTarget} CLEARED — STABILIZER ALIGNMENT REQUIRED`,
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
      } else if (action === "verification") {
        if (!this.state.patternSolved) {
          lockedReason = "VERIFICATION DESK LOCKED — COMPLETE PRIMARY LOGIC FIRST";
        } else if (!this.state.relaySolved) {
          const attempt = String(message.value || "").trim().toUpperCase();
          if (attempt === this.state.relay2Rule) {
            this.state.relaySolved = true;
            this.announceModule("BOARD VERIFICATION PASSED", player.role);
          } else {
            failedReason = "BOARD VERIFICATION FAILED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "operatorCheck2") {
        if (!this.state.patternSolved) {
          lockedReason = "ROUTING DESK LOCKED — COMPLETE PRIMARY LOGIC FIRST";
        } else if ((this.state.crisisSeconds & 8) === 0) {
          const target = this.state.cipherMap.split("~")[6] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 8;
            this.announceModule("DOCUMENT ROUTING CONFIRMED", player.role);
          } else {
            failedReason = "CLASSIFIED FILE MISROUTED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "operatorCheck3") {
        if (!this.state.patternSolved) {
          lockedReason = "DISPATCH BOARD LOCKED — COMPLETE PRIMARY LOGIC FIRST";
        } else if ((this.state.crisisSeconds & 16) === 0) {
          lockedReason = "DISPATCH BOARD LOCKED — AWAIT ANALYST ANOMALY REPORT";
        } else if ((this.state.crisisSeconds & 64) === 0) {
          const target = this.state.cipherMap.split("~")[10] || "";
          if (String(message.value || "").toUpperCase() === target) {
            this.state.crisisSeconds |= 64;
            this.announceModule("FIELD DISPATCH ASSIGNED", player.role);
          } else {
            failedReason = "FIELD DISPATCH MISASSIGNED";
            failedSeverity = "minor";
          }
        }
      } else if (action === "relaySet") {
        if (!this.isRelayRequired()) {
          lockedReason = "STANDARD LOADOUT — STABILIZER BYPASS ACTIVE";
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
        } else if (!this.state.relayWindowActive && !this.hasModule("WIRES")) {
          lockedReason = this.isRelayRequired()
            ? "CUT WINDOW CLOSED — RESTABILIZE THE DEVICE"
            : "CUT WINDOW CLOSED — OPERATOR MUST REAUTHORIZE";
        } else {
          const expectedWire = this.state.safeWireIds[this.state.cutWireIds.length];
          if (!this.state.safeWireIds.includes(id)) {
            this.resetCutStage();
            failedReason = this.boardProfile() === "BRAVO"
              ? `FUSE ${id} IS OUTSIDE THE HIGH-LOAD BANK`
              : this.boardProfile() === "CHARLIE"
                ? `BREAKER ${id} DOES NOT HAVE A PRIME INDEX`
                : this.boardProfile() === "DELTA"
                  ? `ISOLATOR ${id} IS NOT ON AN ODD CIRCUIT`
                  : `WIRE ${id} WAS NOT THE DESIGNATED TARGET`;
            failedSeverity = "major";
          } else if ((this.state.difficulty === "EXTREME" || this.boardProfile() === "BRAVO") && id !== expectedWire) {
            this.state.cutWireIds.splice(0, this.state.cutWireIds.length);
            this.resetCutStage();
            failedReason = this.boardProfile() === "BRAVO"
              ? `FUSE ARMING SEQUENCE FAILED — EXPECTED ${expectedWire} NEXT`
              : `WIRE SEQUENCE VIOLATION — EXPECTED ${expectedWire} NEXT`;
            failedSeverity = "major";
          } else {
            this.state.cutWireIds.push(id);
            if (this.isWireSolved()) {
              this.state.relayWindowActive = false;
              this.state.relayWindow = 0;
              this.announceModule(this.boardProfile() === "BRAVO"
                ? "FUSE BANK ARMED IN SEQUENCE"
                : this.boardProfile() === "CHARLIE"
                  ? "PRIME BREAKERS OPENED"
                  : this.boardProfile() === "DELTA"
                    ? "ODD CIRCUITS ISOLATED"
                    : this.state.safeWireIds.length === 1 ? "TARGET WIRE SEVERED" : "TARGET WIRES SEVERED", player.role);
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
      return ["radar", "frequency", "analystCheck", "analystCheck2", "analystCheck3", "pattern", "calibration", "technicianCheck", "technicianCheck2", "verification", "operatorCheck2", "operatorCheck3", "relaySet", "relay", "wire", "auth", "order"].includes(String(action));
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
    this.generation += 1;
    const boardSeed = `${this.runSeed}:${preservedBoardNumber || 1}:${this.generation}:${this.state.difficulty}`;
    const random = seededRandom(hashSeed(boardSeed));
    const location = randomItem(MISSION_LOCATIONS, random);
    const availableProfiles = this.state.difficulty === "STANDARD"
      ? ["ALPHA", "BRAVO"]
      : this.state.difficulty === "HARD"
        ? ["ALPHA", "BRAVO", "CHARLIE"]
        : ["ALPHA", "BRAVO", "CHARLIE", "DELTA"];
    const profileDeck = shuffled(availableProfiles, seededRandom(hashSeed(`${this.runSeed}:${this.state.difficulty}:PROFILE-DECK`)));
    const boardProfile = profileDeck[Math.max(0, (preservedBoardNumber || 1) - 1) % profileDeck.length];
    const radarContact = randomItem(["TGT-01", "TGT-02", "UNK-A"] as const, random);
    let targetFrequency = generateFrequency(random);
    const cipherLength = this.state.difficulty === "EXTREME" ? 6 : this.state.difficulty === "HARD" ? 5 : 4;
    let patternCode = generateCipherCode(random, cipherLength);
    let authCode = generateAuthCode(random);
    const wireCount = WIRES_PER_DIFFICULTY[this.state.difficulty];
    const safeCount = SAFE_WIRE_COUNT[this.state.difficulty];
    const availableWireIds = ["A", "B", "C", "D", "E", "F", "G"].slice(0, wireCount);
    const selectedSafeIds = shuffled(availableWireIds, random).slice(0, safeCount);
    const radarRules = this.state.difficulty === "STANDARD"
      ? ["WINDOW", "NEAREST"]
      : this.state.difficulty === "HARD"
        ? ["WINDOW", "NEAREST", "FARTHEST", "ODD_RANGE"]
        : ["WINDOW", "NEAREST", "FARTHEST", "ODD_RANGE", "NORTHMOST"];
    const radarRule = ({ ALPHA: "WINDOW", BRAVO: "NEAREST", CHARLIE: "ODD_RANGE", DELTA: "NORTHMOST" } as Record<string, string>)[boardProfile] || shuffled(radarRules, random)[0];
    const radarTolerance = RADAR_TOLERANCE[this.state.difficulty];
    const targetBearing = 20 + Math.floor(random() * 321);
    const decoyBearings = shuffled([
      (targetBearing + 70 + Math.floor(random() * 50)) % 360,
      (targetBearing + 190 + Math.floor(random() * 50)) % 360,
    ], random);
    const contactIds = ["TGT-01", "TGT-02", "UNK-A"];
    const targetIndex = contactIds.indexOf(radarContact);
    const bearings = contactIds.map((_, index) => (index === targetIndex ? targetBearing : decoyBearings.shift()!));
    if (radarRule === "NORTHMOST") {
      bearings[targetIndex] = 8 + Math.floor(random() * 43);
      contactIds.forEach((_, index) => { if (index !== targetIndex) bearings[index] = 105 + Math.floor(random() * 225); });
    }
    const ranges = contactIds.map((_, index) => {
      if (radarRule === "NEAREST") return index === targetIndex ? 24 + Math.floor(random() * 15) : 52 + Math.floor(random() * 34);
      if (radarRule === "FARTHEST") return index === targetIndex ? 72 + Math.floor(random() * 16) : 24 + Math.floor(random() * 34);
      if (radarRule === "ODD_RANGE") return index === targetIndex ? 31 + Math.floor(random() * 25) * 2 : 28 + Math.floor(random() * 28) * 2;
      return 28 + Math.floor(random() * 58);
    });
    const cipherMap = shuffled(["△", "○", "□", "◇"], random);
    const cipherModes = this.state.difficulty === "STANDARD" ? ["LTR", "RTL"] : this.state.difficulty === "HARD" ? ["LTR", "RTL", "PAIRS"] : ["LTR", "RTL", "PAIRS", "OUTSIDE"];
    const cipherDirection = randomItem(cipherModes, random);
    const digits = patternCode.split("-");
    let patternTarget = digits.map((digit) => cipherMap[Number(digit) - 1]).join("");
    const relay1Rule = shuffled(["HIGH_BAND", "MID_BAND", "TENTHS_ODD"], random)[0];
    const relay2Rule = shuffled(["SUM_EVEN", "ENDS_MATCH", "RISING_EDGE"], random)[0];
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
    const wireRule = ({ ALPHA: "EVEN", BRAVO: "HIGH", CHARLIE: "PRIME", DELTA: "ODD" } as Record<string, "EVEN" | "HIGH" | "PRIME" | "ODD">)[boardProfile] || "EVEN";
    const passingCodes = wireRule === "EVEN" ? [2, 4, 6, 8] : wireRule === "HIGH" ? [6, 7, 8, 9] : wireRule === "ODD" ? [1, 3, 5, 7, 9] : [2, 3, 5, 7];
    const failingCodes = wireRule === "EVEN" ? [1, 3, 5, 7, 9] : wireRule === "HIGH" ? [1, 2, 3, 4, 5] : wireRule === "ODD" ? [2, 4, 6, 8] : [1, 4, 6, 8, 9];
    const safeCodePool = shuffled(passingCodes, random).slice(0, safeCount);
    const codeByWire = Object.fromEntries(availableWireIds.map((id) => [
      id,
      selectedSafeIds.includes(id) ? safeCodePool[selectedSafeIds.indexOf(id)] : randomItem(failingCodes, random),
    ]));
    const orderedSafeIds = this.state.difficulty === "EXTREME" || boardProfile === "BRAVO"
      ? [...selectedSafeIds].sort((a, b) => codeByWire[a] - codeByWire[b])
      : selectedSafeIds;
    const safeWireIds = orderedSafeIds.join("");
    const wireCodes = availableWireIds.map((id) => String(codeByWire[id])).join("");

    const bombId = makeBombId(random);
    const protocolRule = boardProfile === "ALPHA" || boardProfile === "CHARLIE" ? "FREQUENCY" : "SERIAL";
    const protocolIndex = protocolRule === "SUM"
      ? digitValues.reduce((sum, digit) => sum + digit, 0) % 3
      : protocolRule === "SERIAL"
        ? (bombId.charCodeAt(bombId.length - 1) - 65) % 3
        : Math.round(targetFrequency * 10) % 3;
    const orderTarget = `${["A", "B", "C"][protocolIndex]}|${protocolRule}`;
    let visibleSequence: Array<number | string> = [];
    let matrixAnswers: Array<number | string> = [];
    let matrixOptions: Array<number | string> = [];
    let matrixRule = "";
    if (boardProfile === "BRAVO") {
      const channelValues = shuffled([3, 6, 9, 12, 15, 18, 21], random).slice(0, 4);
      visibleSequence = channelValues.map((value, index) => `${String.fromCharCode(65 + index)}:${value}`);
      matrixAnswers = channelValues.map((value, index) => ({ value, channel: String.fromCharCode(65 + index) })).sort((a, b) => a.value - b.value).map((item) => item.channel);
      matrixOptions = ["A", "B", "C", "D"];
      matrixRule = "CHANNEL SORT: ENTER CHANNEL LETTERS FROM LOWEST READING TO HIGHEST";
    } else if (boardProfile === "CHARLIE") {
      const lamps = Array.from({ length: 4 }, () => Math.floor(random() * 2));
      visibleSequence = lamps.map((value, index) => `IN${index + 1}:${value}`);
      matrixAnswers = lamps.map((value, index) => value ^ lamps[(index + 1) % lamps.length]);
      matrixOptions = [0, 1];
      matrixRule = "XOR RING: EACH OUTPUT IS 1 WHEN ITS INPUT PAIR DIFFERS; PAIRS 1-2, 2-3, 3-4, 4-1";
    } else if (boardProfile === "DELTA") {
      const symbols = ["△", "○", "□", "◇"];
      const letters = shuffled(["K", "M", "R", "T"], random);
      visibleSequence = Array.from({ length: 3 }, () => randomItem(symbols, random));
      matrixAnswers = visibleSequence.map((symbol) => letters[symbols.indexOf(String(symbol))]);
      matrixOptions = letters;
      matrixRule = `ONE-TIME CODEBOOK: ${symbols.map((symbol, index) => `${symbol}=${letters[index]}`).join("  ")}`;
    } else {
      const start = 1 + Math.floor(random() * 4);
      const addStep = 2 + Math.floor(random() * 4);
      const multiplier = 2 + Math.floor(random() * 2);
      const fullSequence = [start];
      for (let index = 1; index < 7; index += 1) fullSequence.push(index % 2 === 1 ? fullSequence[index - 1] + addStep : fullSequence[index - 1] * multiplier);
      visibleSequence = fullSequence.slice(0, 5);
      matrixAnswers = fullSequence.slice(5, 7);
      matrixRule = `ALTERNATING SERIES: +${addStep}, THEN ×${multiplier}`;
      const numericAnswers = matrixAnswers.map(Number);
      const distractors = [numericAnswers[0] + 1, Math.max(0, numericAnswers[0] - 1), numericAnswers[1] + 2, Math.max(0, numericAnswers[1] - 2)];
      matrixOptions = shuffled([...new Set([...matrixAnswers, ...distractors])], random);
    }
    patternCode = matrixAnswers.join("-");
    patternTarget = `${visibleSequence.join(",")}|${matrixOptions.join(",")}|${matrixRule}`;
    const gaugeA = 12 + Math.floor(random() * 18);
    const gaugeB = 3 + Math.floor(random() * 8);
    const calibrationSpec = boardProfile === "BRAVO"
      ? { target: gaugeA * 2 - gaugeB, formula: "A × 2 − B" }
      : boardProfile === "CHARLIE"
        ? { target: gaugeA + gaugeB, formula: "A + B" }
        : boardProfile === "DELTA"
          ? { target: Math.abs(gaugeA - gaugeB) * 2, formula: "ABS(A − B) × 2" }
          : { target: gaugeA + gaugeB * 2, formula: "A + B × 2" };
    const calibrationTarget = calibrationSpec.target;
    const calibrationClue = `${gaugeA}|${gaugeB}|${calibrationSpec.formula}`;
    authCode = `${calibrationClue}|${calibrationTarget}`;
    let verificationSpec = "";
    let verificationTarget = "";
    if (boardProfile === "BRAVO") {
      const inlet = 20 + Math.floor(random() * 30);
      const outlet = 20 + Math.floor(random() * 30);
      verificationTarget = inlet === outlet ? "HOLD" : inlet > outlet ? "VENT" : "FEED";
      verificationSpec = `PRESSURE ROUTING|INLET ${inlet} / OUTLET ${outlet}|IF INLET IS HIGHER: VENT. LOWER: FEED. EQUAL: HOLD.|VENT,FEED,HOLD`;
    } else if (boardProfile === "CHARLIE") {
      const bits = Array.from({ length: 3 }, () => Math.floor(random() * 2));
      verificationTarget = String((bits[0] & bits[1]) | (bits[2] ^ bits[0]));
      verificationSpec = `RELAY LOGIC TEST|A=${bits[0]}  B=${bits[1]}  C=${bits[2]}|(A AND B) OR (C XOR A)|0,1`;
    } else if (boardProfile === "DELTA") {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const sourceIndex = Math.floor(random() * alphabet.length);
      const shift = 2 + Math.floor(random() * 7);
      verificationTarget = alphabet[(sourceIndex + shift) % alphabet.length];
      const options = shuffled([verificationTarget, alphabet[(sourceIndex + shift + 3) % 26], alphabet[(sourceIndex + shift + 7) % 26], alphabet[(sourceIndex + shift + 11) % 26]], random);
      verificationSpec = `CODEWHEEL OFFSET|SET ${alphabet[sourceIndex]} / ADVANCE ${shift}|MOVE FORWARD THROUGH THE ALPHABET; WRAP AFTER Z.|${options.join(",")}`;
    } else {
      const checks = Array.from({ length: 4 }, () => 10 + Math.floor(random() * 80));
      verificationTarget = String(checks.reduce((sum, value) => sum + value, 0) % 10);
      const options = shuffled([verificationTarget, String((Number(verificationTarget) + 2) % 10), String((Number(verificationTarget) + 5) % 10), String((Number(verificationTarget) + 7) % 10)], random);
      verificationSpec = `TELETYPE CHECKSUM|${checks.join(" + ")}|ADD ALL GROUPS; TRANSMIT ONLY THE FINAL DIGIT.|${options.join(",")}`;
    }
    let analystSpec = "";
    let analystTarget = "";
    let technicianSpec = "";
    let technicianTarget = "";
    if (boardProfile === "BRAVO") {
      const leftFlow = 10 + Math.floor(random() * 30);
      const rightFlow = 10 + Math.floor(random() * 30);
      analystTarget = leftFlow === rightFlow ? "BALANCED" : leftFlow > rightFlow ? "LEFT" : "RIGHT";
      analystSpec = `FLOW TRACE|L=${leftFlow}  R=${rightFlow}|REPORT THE STRONGER RETURN.|LEFT,RIGHT,BALANCED`;
      technicianTarget = gaugeA > gaugeB ? "BYPASS A" : "BYPASS B";
      technicianSpec = `COOLANT BYPASS|LOOP A=${gaugeA}  LOOP B=${gaugeB}|BYPASS THE HIGHER-PRESSURE LOOP.|BYPASS A,BYPASS B`;
    } else if (boardProfile === "CHARLIE") {
      const parityBits = Array.from({ length: 6 }, () => Math.floor(random() * 2));
      analystTarget = parityBits.reduce((sum, bit) => sum + bit, 0) % 2 ? "ODD" : "EVEN";
      analystSpec = `PARITY REGISTER|${parityBits.join(" ")}|COUNT LIVE BITS; REPORT ODD OR EVEN.|ODD,EVEN`;
      technicianTarget = safeCount % 2 ? "SERIES" : "PARALLEL";
      technicianSpec = `INTERLOCK BUS|${safeCount} ACTIVE BRANCH${safeCount === 1 ? "" : "ES"}|ODD BRANCH COUNT = SERIES; EVEN = PARALLEL.|SERIES,PARALLEL`;
    } else if (boardProfile === "DELTA") {
      const row = 1 + Math.floor(random() * 4);
      const column = 1 + Math.floor(random() * 4);
      analystTarget = String((row - 1) * 4 + column);
      analystSpec = `GRID REFERENCE|ROW ${row} / COLUMN ${column}|NUMBER A 4×4 GRID LEFT-TO-RIGHT, TOP-TO-BOTTOM.|${shuffled([analystTarget,String(((Number(analystTarget)+3)%16)+1),String(((Number(analystTarget)+7)%16)+1),String(((Number(analystTarget)+11)%16)+1)],random).join(",")}`;
      technicianTarget = ["0°", "90°", "180°", "270°"][Math.round(targetFrequency * 10) % 4];
      technicianSpec = `PHASE COUPLER|CARRIER ${targetFrequency.toFixed(1)}|REMOVE DECIMAL; DIVIDE BY 4. REMAINDER 0/1/2/3 = 0°/90°/180°/270°.|0°,90°,180°,270°`;
    } else {
      const pulseGroups = Array.from({ length: 4 }, () => 1 + Math.floor(random() * 5));
      analystTarget = String(pulseGroups.reduce((sum, value) => sum + value, 0) % 4);
      analystSpec = `PULSE GROUP CHECK|${pulseGroups.join(" · ")}|ADD GROUPS; DIVIDE BY 4; REPORT THE REMAINDER.|0,1,2,3`;
      technicianTarget = wireCodes.split("").reduce((sum, value) => sum + Number(value), 0) % 2 ? "REVERSE" : "NORMAL";
      technicianSpec = `CONTINUITY POLARITY|MARKS ${wireCodes.split("").join("-")}|ADD ALL MARKS. ODD = REVERSE; EVEN = NORMAL.|NORMAL,REVERSE`;
    }
    const signatureDeck = [
      { readout: "SHORT · SHORT · LONG", target: "COURIER", rule: "TWO SHORT PULSES FOLLOWED BY ONE LONG PULSE" },
      { readout: "LONG · SHORT · LONG", target: "MILITARY", rule: "A SHORT PULSE BETWEEN TWO LONG PULSES" },
      { readout: "LONG · LONG · SHORT", target: "DIPLOMATIC", rule: "TWO LONG PULSES FOLLOWED BY ONE SHORT PULSE" },
      { readout: "SHORT · LONG · SHORT", target: "CIVILIAN", rule: "A LONG PULSE BETWEEN TWO SHORT PULSES" },
    ];
    const signature = randomItem(signatureDeck, random);
    const analystSpec2 = `SIGNATURE LIBRARY|${signature.readout}|${signature.rule}|COURIER,MILITARY,DIPLOMATIC,CIVILIAN`;
    const routingDeck = [
      { seal: "RED SEAL / EYES ONLY", target: "DIRECTOR" },
      { seal: "BLUE SEAL / TECHNICAL", target: "ENGINEERING" },
      { seal: "GREEN SEAL / INTERCEPT", target: "SIGNALS" },
      { seal: "AMBER SEAL / FIELD", target: "OPERATIONS" },
    ];
    const routing = randomItem(routingDeck, random);
    const operatorSpec2 = `CLASSIFIED ROUTING|${routing.seal}|ROUTE BY SEAL COLOR AND FILE MARKING.|DIRECTOR,ENGINEERING,SIGNALS,OPERATIONS`;
    const anomalyPosition = randomItem(["A", "B", "C", "D"] as const, random);
    const anomalyGlyphs = { A: "◆ ◇ ◇ ◇", B: "◇ ◆ ◇ ◇", C: "◇ ◇ ◆ ◇", D: "◇ ◇ ◇ ◆" };
    const anomalyNames = { ALPHA: "TAPE DEFECT", BRAVO: "SPECTRUM NOTCH", CHARLIE: "FAULTY LAMP", DELTA: "FORGED GLYPH" } as Record<string, string>;
    const anomalyAction = ({ ALPHA: "REWIND", BRAVO: "FILTER", CHARLIE: "RESET", DELTA: "REJECT" } as Record<string, string>)[boardProfile] || "RESET";
    const analystSpec3 = `${anomalyNames[boardProfile] || "SIGNAL ANOMALY"}|${anomalyGlyphs[anomalyPosition]}|1: MARK THE DIFFERENT POSITION. 2: REQUEST THIS PROFILE'S CORRECTIVE ACTION FROM OPERATOR.|A,B,C,D/REWIND,FILTER,RESET,REJECT`;
    const dispatchDeck = [
      { clue: "NIGHT / AIR", target: "FALCON" }, { clue: "DAY / GROUND", target: "BADGER" },
      { clue: "NIGHT / GROUND", target: "WOLF" }, { clue: "DAY / AIR", target: "LARK" },
    ];
    const dispatch = randomItem(dispatchDeck, random);
    const dispatchChannel = dispatch.clue.startsWith("NIGHT") ? "BLACK" : "WHITE";
    const operatorSpec3 = `FIELD DISPATCH|${dispatch.clue}|1: ASSIGN CALLSIGN FROM THIS TABLE: NIGHT AIR=FALCON; DAY GROUND=BADGER; NIGHT GROUND=WOLF; DAY AIR=LARK. 2: REQUEST CHANNEL COLOR FROM ANALYST.|FALCON,BADGER,WOLF,LARK/BLACK,WHITE`;
    const jackDeck = [
      { clue: "ROUND / RED", target: "JACK A" }, { clue: "SQUARE / BLUE", target: "JACK B" },
      { clue: "ROUND / BLUE", target: "JACK C" }, { clue: "SQUARE / RED", target: "JACK D" },
    ];
    const jack = randomItem(jackDeck, random);
    const patchTwist = jack.clue.startsWith("ROUND") ? "CW" : "CCW";
    const technicianSpec2 = `PATCH JACK ROUTING|${jack.clue}|1: MATCH SHAPE AND COLLAR. 2: REQUEST CONNECTOR LOCK DIRECTION FROM OPERATOR.|JACK A,JACK B,JACK C,JACK D/CW,CCW`;
    this.state.bombId = bombId;
    this.state.missionSeed = this.runSeed;
    this.state.seconds = DIFFICULTY_SECONDS[this.state.difficulty];
    this.state.missionVariant = `${boardProfile}|${location.name}`;
    this.state.radarContact = radarContact;
    this.state.radarLat = location.lat;
    this.state.radarLon = location.lon;
    this.state.radarGrid = location.grid;
    this.state.radarSelection = "";
    const signalActive = true;
    const matrixActive = true;
    const calibrationActive = true;
    this.state.radarSolved = !signalActive;
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
    this.state.frequency = signalActive ? 144.5 : targetFrequency;
    this.state.patternCode = patternCode;
    this.state.patternTarget = patternTarget;
    this.state.cipherMap = `${cipherMap.join("")}~${analystSpec}~${analystTarget}~${analystSpec2}~${signature.target}~${operatorSpec2}~${routing.target}~${analystSpec3}~${anomalyPosition}:${anomalyAction}~${operatorSpec3}~${dispatch.target}:${dispatchChannel}`;
    this.state.cipherDirection = cipherDirection;
    this.state.authCode = authCode;
    this.state.orderTarget = orderTarget;
    this.state.relay1Rule = verificationSpec;
    this.state.relay2Rule = verificationTarget;
    this.state.safeWireIds = safeWireIds;
    this.state.wireCodes = `${wireCodes}~${technicianSpec}~${technicianTarget}~${technicianSpec2}~${jack.target}:${patchTwist}`;
    this.state.wireRule = wireRule;
    this.state.relay1Target = relay1Target;
    this.state.relay2Target = relay2Target;
    this.state.relayWindowMax = CUT_WINDOW_SECONDS[this.state.difficulty];
    this.state.relayWindow = 0;
    this.state.relayWindowActive = false;
    this.state.frequencySolved = !signalActive;
    this.state.patternSolved = !matrixActive;
    this.state.authSolved = !calibrationActive;
    this.state.relay1 = false;
    this.state.relay2 = true;
    this.state.relaySolved = false;
    this.state.orderSolved = false;
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
      this.state.runStartedAt = 0;
      this.state.penaltyLog = "[]";
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
    return false;
  }

  private boardProfile() {
    return this.state.missionVariant.split("|")[0] || "ALPHA";
  }

  private hasModule(module: "SIGNAL" | "MATRIX" | "CALIBRATION" | "WIRES") {
    const modules: Record<string, string[]> = {
      ALPHA: ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"],
      BRAVO: ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"],
      CHARLIE: ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"],
      DELTA: ["SIGNAL", "MATRIX", "CALIBRATION", "WIRES"],
    };
    return (modules[this.boardProfile()] || modules.ALPHA).includes(module);
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
    if (this.hasModule("WIRES")) {
      this.state.orderSolved = true;
      return;
    }
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
    let penalties: Array<Record<string, unknown>> = [];
    try { penalties = JSON.parse(this.state.penaltyLog || "[]"); } catch { penalties = []; }
    penalties.push({ role, reason, severity, seconds, strike: this.state.strikes, board: this.state.boardNumber, remainingSeconds: this.state.seconds });
    this.state.penaltyLog = JSON.stringify(penalties.slice(-20));
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
    if (!this.hasModule("WIRES")) return true;
    const safeWireIds = this.state.safeWireIds.split("").filter(Boolean);
    return safeWireIds.every((id) => this.state.cutWireIds.includes(id));
  }

  private isBoardSolved() {
    return this.state.radarSolved
      && this.state.frequencySolved
      && (this.state.crisisSeconds & 1) !== 0
      && (this.state.crisisSeconds & 4) !== 0
      && (this.state.crisisSeconds & 16) !== 0
      && this.state.patternSolved
      && this.state.authSolved
      && (this.state.crisisSeconds & 2) !== 0
      && (this.state.crisisSeconds & 32) !== 0
      && (this.state.crisisSeconds & 8) !== 0
      && (this.state.crisisSeconds & 64) !== 0
      && this.state.relaySolved
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
        missionSeed: this.runSeed,
        boards: this.state.boardCount,
      });
      const topByDifficulty = new Map<string, TriFusalLeaderboardEntry[]>();
      for (const entry of TRI_FUSAL_LEADERBOARD) {
        const entries = topByDifficulty.get(entry.difficulty) || [];
        entries.push(entry);
        entries.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || b.score - a.score);
        topByDifficulty.set(entry.difficulty, entries.slice(0, 10));
      }
      TRI_FUSAL_LEADERBOARD.splice(0, TRI_FUSAL_LEADERBOARD.length, ...[...topByDifficulty.values()].flat());
      persistLeaderboard(TRI_FUSAL_LEADERBOARD);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.broadcast(status === "defused" ? "bombDefused" : "bombDetonated", {
      seconds: this.state.seconds,
      score: this.state.score,
      strikes: this.state.strikes,
      difficulty: this.state.difficulty,
      boards: this.state.boardCount,
      missionSeed: this.runSeed,
      elapsedSeconds: Math.max(0, DIFFICULTY_SECONDS[this.state.difficulty] - this.state.seconds),
      penalties: JSON.parse(this.state.penaltyLog || "[]"),
    });
    this.clock.setTimeout(() => void this.disconnect(), 30_000);
  }
}
