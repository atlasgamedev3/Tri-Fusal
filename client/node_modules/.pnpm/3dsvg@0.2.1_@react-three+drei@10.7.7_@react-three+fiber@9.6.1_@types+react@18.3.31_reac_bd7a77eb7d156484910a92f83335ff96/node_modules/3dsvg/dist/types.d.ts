/**
 * =============================================================================
 * Types
 * =============================================================================
 *
 * Public type definitions for the 3dsvg engine. SVG3DProps is the single
 * prop interface for the <SVG3D> component — content, shape, material,
 * camera, lighting, animation, and interaction.
 *
 * @packageDocumentation
 */
type MaterialPreset = "default" | "plastic" | "metal" | "glass" | "rubber" | "chrome" | "gold" | "clay" | "emissive" | "holographic";
interface SVG3DProps {
    text?: string;
    font?: string;
    svg?: string;
    /** @deprecated Use `svg` instead */
    svgString?: string;
    depth?: number;
    smoothness?: number;
    color?: string;
    material?: MaterialPreset;
    metalness?: number;
    roughness?: number;
    opacity?: number;
    wireframe?: boolean;
    rotationX?: number;
    rotationY?: number;
    zoom?: number;
    fov?: number;
    interactive?: boolean;
    cursorOrbit?: boolean;
    orbitStrength?: number;
    draggable?: boolean;
    scrollZoom?: boolean;
    resetOnIdle?: boolean;
    resetDelay?: number;
    texture?: string;
    textureRepeat?: number;
    textureRotation?: number;
    textureOffset?: [number, number];
    lightPosition?: [number, number, number];
    lightIntensity?: number;
    ambientIntensity?: number;
    shadow?: boolean;
    animate?: "none" | "spin" | "float" | "pulse" | "wobble" | "spinFloat" | "swing";
    animateSpeed?: number;
    animateReverse?: boolean;
    intro?: "zoom" | "fade" | "none";
    introDuration?: number;
    introFrom?: {
        zoom?: number;
        opacity?: number;
    };
    introTo?: {
        zoom?: number;
        opacity?: number;
    };
    width?: string | number;
    height?: string | number;
    background?: string;
    className?: string;
    onReady?: () => void;
    onAnimationComplete?: () => void;
    onLoadingChange?: (loading: boolean, progress: number) => void;
    resetKey?: number;
    registerCanvas?: (canvas: HTMLCanvasElement) => void;
    children?: React.ReactNode;
}
declare const defaultProps: Required<Pick<SVG3DProps, "font" | "depth" | "smoothness" | "color" | "material" | "metalness" | "roughness" | "opacity" | "wireframe" | "rotationX" | "rotationY" | "zoom" | "fov" | "textureRepeat" | "textureRotation" | "textureOffset" | "lightPosition" | "lightIntensity" | "ambientIntensity" | "shadow" | "cursorOrbit" | "orbitStrength" | "draggable" | "scrollZoom" | "resetOnIdle" | "resetDelay" | "intro" | "introDuration" | "introFrom" | "introTo" | "width" | "height" | "background">>;

export { type MaterialPreset, type SVG3DProps, defaultProps };
