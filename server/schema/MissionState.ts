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
  @type("number") seconds = 540;
  @type("number") frequency = 144.5;
  @type("number") targetFrequency = 156.8;
  @type("string") missionVariant = "NIGHT GLASS";
  @type("string") radarContact = "TGT-01";
  @type("string") radarLat = "47°22.4'N";
  @type("string") radarLon = "015°07.2'E";
  @type("string") radarGrid = "BN-7742";
  @type("string") radarSelection = "";
  @type("boolean") radarSolved = false;
  @type("number") radarTargetBearing = 90;
  @type("number") radarBearing1 = 90;
  @type("number") radarBearing2 = 210;
  @type("number") radarBearing3 = 330;
  @type("number") radarRange1 = 42;
  @type("number") radarRange2 = 61;
  @type("number") radarRange3 = 78;
  @type("string") radarRule = "WINDOW";
  @type("number") radarTolerance = 8;
  @type("string") patternCode = "1-2-3-2";
  @type("string") patternTarget = "△○□○";
  @type("string") cipherMap = "△○□◇";
  @type("string") cipherDirection = "LTR";
  @type("string") authCode = "DELTA-7-ECHO";
  @type("string") orderTarget = "B";
  @type("string") safeWireIds = "B";
  @type("string") wireCodes = "246";
  @type("string") wireRule = "EVEN";
  @type("boolean") relay1Target = true;
  @type("boolean") relay2Target = true;
  @type("string") relay1Rule = "HIGH_BAND";
  @type("string") relay2Rule = "SUM_EVEN";
  @type("number") relayWindow = 0;
  @type("number") relayWindowMax = 45;
  @type("boolean") relayWindowActive = false;
  @type("boolean") frequencySolved = false;
  @type("boolean") patternSolved = false;
  @type("boolean") authSolved = false;
  @type("boolean") relay1 = false;
  @type("boolean") relay2 = true;
  @type("boolean") relaySolved = false;
  @type("boolean") orderSolved = false;
  @type("boolean") analystAck = false;
  @type("boolean") technicianAck = false;
  @type("boolean") operatorAck = false;
  @type("boolean") interlockSolved = false;
  @type(["string"]) cutWireIds = new ArraySchema<string>();
  @type("number") solvedPuzzleCount = 0;
  @type("number") requiredPuzzleCount = 7;
  @type("number") strikes = 0;
  @type("number") maxStrikes = 3;
}
