"use client";

// src/types.ts
var defaultProps = {
  font: "DM Sans",
  depth: 1,
  smoothness: 0.2,
  color: "#ffffff",
  material: "default",
  metalness: 0.15,
  roughness: 0.35,
  opacity: 1,
  wireframe: false,
  rotationX: 0,
  rotationY: 0,
  zoom: 8,
  fov: 50,
  textureRepeat: 1,
  textureRotation: 0,
  textureOffset: [0, 0],
  lightPosition: [5, 8, 5],
  lightIntensity: 1.2,
  ambientIntensity: 0.3,
  shadow: true,
  cursorOrbit: true,
  orbitStrength: 0.15,
  draggable: true,
  scrollZoom: false,
  resetOnIdle: false,
  resetDelay: 2,
  intro: "zoom",
  introDuration: 2.5,
  introFrom: { zoom: 18, opacity: 0 },
  introTo: { zoom: 8, opacity: 1 },
  width: "100%",
  height: "100%",
  background: "transparent"
};
export {
  defaultProps
};
