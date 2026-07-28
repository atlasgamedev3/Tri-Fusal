/** Cold-war instrument chrome shared by the live game HUD. */
export const HUD_CHROME = {
  border: "rgba(196, 168, 79, 0.34)",
  barBorder: "rgba(196, 168, 79, 0.38)",
  barInset: "rgba(200, 134, 26, 0.22)",
  connectorFrom: "rgba(232, 223, 196, 0.24)",
  connectorVia: "rgba(196, 168, 79, 0.28)",
  connectorTo: "rgba(90, 112, 64, 0.32)",
  marker: "#c4a84f",
  markerRing: "rgba(196, 168, 79, 0.24)",
} as const;

/** Tiny corner L-brackets (sky hairline). Parent should be `relative overflow-hidden`. */
export function HudCornerLs() {
  return null;
}
