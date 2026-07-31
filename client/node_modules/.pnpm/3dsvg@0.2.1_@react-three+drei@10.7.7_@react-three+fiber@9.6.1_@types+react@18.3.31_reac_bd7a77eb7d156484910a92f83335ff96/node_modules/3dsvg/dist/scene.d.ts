import * as react_jsx_runtime from 'react/jsx-runtime';
import * as THREE from 'three';
import { MaterialSettings } from './materials.js';
import { AnimationType } from './controls.js';
import './types.js';

interface ExtrudedSVGProps {
    svgString: string;
    depth: number;
    smoothness: number;
    color: string;
    materialSettings: MaterialSettings;
    rotationX: number;
    rotationY: number;
    groupRef: React.RefObject<THREE.Group | null>;
    texture?: string;
    textureRepeat?: number;
    textureRotation?: number;
    textureOffset?: [number, number];
    onLoadingChange?: (loading: boolean, progress: number) => void;
}
interface ExtrudedGeometryResult {
    geometries: THREE.BufferGeometry[];
    center: THREE.Vector3;
    baseScale: number;
}
declare function useExtrudedGeometry(svgString: string, depth: number, smoothness: number): ExtrudedGeometryResult & {
    loading: boolean;
    progress: number;
    cancel: () => void;
};
declare function ExtrudedSVG({ svgString, depth, smoothness, color, materialSettings, rotationX, rotationY, groupRef, texture: textureUrl, textureRepeat, textureRotation, textureOffset, onLoadingChange, }: ExtrudedSVGProps): react_jsx_runtime.JSX.Element;
interface SVG3DSceneProps {
    svgString: string;
    depth: number;
    smoothness: number;
    color: string;
    materialSettings: MaterialSettings;
    rotationX: number;
    rotationY: number;
    zoom: number;
    fov: number;
    texture?: string;
    textureRepeat?: number;
    textureRotation?: number;
    textureOffset?: [number, number];
    lightPosition: [number, number, number];
    lightIntensity: number;
    ambientIntensity: number;
    shadow: boolean;
    cursorOrbit: boolean;
    orbitStrength: number;
    draggable: boolean;
    scrollZoom: boolean;
    animate: AnimationType;
    animateSpeed: number;
    animateReverse: boolean;
    intro: "zoom" | "fade" | "none";
    introDuration: number;
    introFrom: {
        zoom?: number;
        opacity?: number;
    };
    introTo: {
        zoom?: number;
        opacity?: number;
    };
    resetOnIdle: boolean;
    resetDelay: number;
    background: string;
    onReady?: () => void;
    onAnimationComplete?: () => void;
    onLoadingChange?: (loading: boolean, progress: number) => void;
    resetKey?: number;
    registerCanvas?: (canvas: HTMLCanvasElement) => void;
    children?: React.ReactNode;
}
declare function SVG3DScene({ svgString, depth, smoothness, color, materialSettings, rotationX, rotationY, zoom, fov, texture, textureRepeat, textureRotation, textureOffset, lightPosition, lightIntensity, ambientIntensity, shadow, cursorOrbit, orbitStrength, draggable, scrollZoom, animate, animateSpeed, animateReverse, resetOnIdle, resetDelay, intro, introDuration, introFrom, introTo, background, onReady, onAnimationComplete, onLoadingChange, resetKey, registerCanvas, children, }: SVG3DSceneProps): react_jsx_runtime.JSX.Element;

export { type ExtrudedGeometryResult, ExtrudedSVG, type ExtrudedSVGProps, SVG3DScene, type SVG3DSceneProps, SVG3DScene as default, useExtrudedGeometry };
