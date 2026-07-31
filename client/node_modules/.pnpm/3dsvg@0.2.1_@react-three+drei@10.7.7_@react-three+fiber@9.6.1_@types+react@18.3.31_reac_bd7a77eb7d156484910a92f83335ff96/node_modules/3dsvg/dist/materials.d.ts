import { MaterialPreset } from './types.js';

/**
 * =============================================================================
 * Materials
 * =============================================================================
 *
 * PBR material preset system. Defines 10 physically-based presets (default,
 * plastic, metal, glass, rubber, chrome, gold, clay, emissive, holographic)
 * and a resolver that merges preset defaults with user overrides.
 *
 * @packageDocumentation
 */

interface MaterialSettings {
    preset: MaterialPreset;
    metalness: number;
    roughness: number;
    opacity: number;
    transparent: boolean;
    wireframe: boolean;
}
interface MaterialPresetData {
    label: string;
    metalness: number;
    roughness: number;
    opacity: number;
    transparent: boolean;
    emissiveIntensity?: number;
    clearcoat?: number;
}
declare const materialPresets: Record<MaterialPreset, MaterialPresetData>;
declare function resolveMaterial(preset: MaterialPreset, overrides: {
    metalness?: number;
    roughness?: number;
    opacity?: number;
    wireframe?: boolean;
}): MaterialSettings;

export { type MaterialPresetData, type MaterialSettings, materialPresets, resolveMaterial };
