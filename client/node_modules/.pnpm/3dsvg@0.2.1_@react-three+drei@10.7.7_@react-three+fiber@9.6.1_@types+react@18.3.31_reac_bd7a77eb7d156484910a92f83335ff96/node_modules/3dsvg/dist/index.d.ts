import * as react_jsx_runtime from 'react/jsx-runtime';
import { SVG3DProps } from './types.js';
export { MaterialPreset, defaultProps } from './types.js';
export { ExtrudedGeometryResult, ExtrudedSVG, ExtrudedSVGProps, SVG3DScene, SVG3DSceneProps, useExtrudedGeometry } from './scene.js';
export { AnimationType, IntroAnimation, IntroAnimationProps, LoopAnimation, LoopAnimationProps, SmoothControls, SmoothControlsProps, introComplete } from './controls.js';
export { MaterialSettings, materialPresets, resolveMaterial } from './materials.js';
export { textToSvg, useFont } from './use-font.js';
import 'three';
import 'opentype.js';

declare function SVG3D(props: SVG3DProps): react_jsx_runtime.JSX.Element;

export { SVG3D, SVG3DProps };
