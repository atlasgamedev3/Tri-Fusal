"use client";

// src/materials.ts
var materialPresets = {
  default: { label: "Default", metalness: 0.15, roughness: 0.35, opacity: 1, transparent: false },
  plastic: { label: "Plastic", metalness: 0, roughness: 0.3, opacity: 1, transparent: false },
  metal: { label: "Metal", metalness: 0.9, roughness: 0.2, opacity: 1, transparent: false },
  glass: { label: "Glass", metalness: 0.1, roughness: 0.05, opacity: 0.35, transparent: true },
  rubber: { label: "Rubber", metalness: 0, roughness: 0.9, opacity: 1, transparent: false },
  chrome: { label: "Chrome", metalness: 1, roughness: 0.05, opacity: 1, transparent: false },
  gold: { label: "Gold", metalness: 1, roughness: 0.25, opacity: 1, transparent: false },
  clay: { label: "Clay", metalness: 0, roughness: 1, opacity: 1, transparent: false },
  emissive: { label: "Emissive", metalness: 0, roughness: 0.5, opacity: 1, transparent: false, emissiveIntensity: 0.8 },
  holographic: { label: "Holo", metalness: 0.8, roughness: 0.1, opacity: 0.7, transparent: true, clearcoat: 1 }
};
function resolveMaterial(preset, overrides) {
  const base = materialPresets[preset];
  const opacity = overrides.opacity ?? base.opacity;
  return {
    preset,
    metalness: overrides.metalness ?? base.metalness,
    roughness: overrides.roughness ?? base.roughness,
    opacity,
    transparent: base.transparent || opacity < 1,
    wireframe: overrides.wireframe ?? false
  };
}
export {
  materialPresets,
  resolveMaterial
};
