import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export type MissionRole = "analyst" | "technician" | "operator";

export class MissionPlayer extends Schema {
  @type("string") sessionId = "";
  @type("string") userId = "";
  @type("string") name = "";
  @type("string") role: MissionRole = "analyst";
  @type("boolean") connected = true;
}

export class MissionState extends Schema {
  @type({ map: MissionPlayer }) players = new MapSchema<MissionPlayer>();
  @type("string") hostUserId = "";
  @type("string") difficulty = "STANDARD";
  @type("string") bombId = "";
  @type("boolean") gameStarted = false;
  @type("boolean") isGameOver = false;
  @type("string") bombStatus = "ready";
  @type("number") seconds = 252;
  @type("number") frequency = 144.5;
  @type("boolean") frequencySolved = false;
  @type("boolean") patternSolved = false;
  @type("boolean") authSolved = false;
  @type("boolean") relay1 = false;
  @type("boolean") relay2 = true;
  @type("boolean") relaySolved = false;
  @type("boolean") orderSolved = false;
  @type(["string"]) cutWireIds = new ArraySchema<string>();
  @type("number") solvedPuzzleCount = 0;
  @type("number") requiredPuzzleCount = 4;
}
