import * as THREE from 'three';

/**
 * =============================================================================
 * Controls & Animations
 * =============================================================================
 *
 * Camera controls and animation primitives. Provides smooth orbit with
 * momentum, intro transitions (zoom/fade), and looping animations
 * (spin, float, pulse, wobble, swing) driven by useFrame.
 *
 * @packageDocumentation
 */

declare const introComplete: {
    current: boolean;
};
interface IntroAnimationProps {
    type: "zoom" | "fade" | "none";
    duration: number;
    from: {
        zoom?: number;
        opacity?: number;
    };
    to: {
        zoom?: number;
        opacity?: number;
    };
    onComplete?: () => void;
}
declare function IntroAnimation({ type, duration, from, to, onComplete }: IntroAnimationProps): null;
type AnimationType = "none" | "spin" | "float" | "pulse" | "wobble" | "spinFloat" | "swing";
interface LoopAnimationProps {
    type: AnimationType;
    speed: number;
    reverse: boolean;
    meshRef: React.RefObject<THREE.Group | null>;
}
declare function LoopAnimation({ type, speed, reverse, meshRef }: LoopAnimationProps): null;
interface SmoothControlsProps {
    rotationX: number;
    rotationY: number;
    meshRef: React.RefObject<THREE.Group | null>;
    cursorOrbit: boolean;
    orbitStrength: number;
    draggable: boolean;
    scrollZoom: boolean;
    zoom: number;
    resetOnIdle: boolean;
    resetDelay: number;
    resetKey?: number;
}
declare function SmoothControls({ rotationX, rotationY, meshRef, cursorOrbit, orbitStrength, draggable, scrollZoom, zoom, resetOnIdle, resetDelay, resetKey, }: SmoothControlsProps): null;

export { type AnimationType, IntroAnimation, type IntroAnimationProps, LoopAnimation, type LoopAnimationProps, SmoothControls, type SmoothControlsProps, introComplete };
