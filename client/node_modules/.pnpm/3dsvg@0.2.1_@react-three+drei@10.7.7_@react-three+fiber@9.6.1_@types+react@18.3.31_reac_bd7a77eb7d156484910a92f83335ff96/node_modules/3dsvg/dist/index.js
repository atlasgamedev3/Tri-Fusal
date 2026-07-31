"use client";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/materials.ts
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
var materialPresets;
var init_materials = __esm({
  "src/materials.ts"() {
    "use strict";
    materialPresets = {
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
  }
});

// src/controls.tsx
import { useRef, useEffect as useEffect2 } from "react";
import { useThree, useFrame } from "@react-three/fiber";
function IntroAnimation({ type, duration, from, to, onComplete }) {
  const { camera, gl } = useThree();
  const progress = useRef(0);
  const initialized = useRef(false);
  const completeFired = useRef(false);
  if (!initialized.current && type !== "none") {
    initialized.current = true;
    introComplete.current = false;
    camera.position.z = from.zoom ?? 18;
    gl.domElement.style.opacity = String(from.opacity ?? 0);
  }
  if (type === "none" && !initialized.current) {
    initialized.current = true;
    introComplete.current = true;
    camera.position.z = to.zoom ?? 8;
    gl.domElement.style.opacity = "1";
  }
  useFrame((_, delta) => {
    if (type === "none" || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta / duration);
    const t = 1 - Math.pow(1 - progress.current, 4);
    const fromZ = from.zoom ?? 18;
    const toZ = to.zoom ?? 8;
    const fromOpacity = from.opacity ?? 0;
    const toOpacity = to.opacity ?? 1;
    if (type === "zoom") {
      camera.position.z = fromZ + (toZ - fromZ) * t;
      gl.domElement.style.opacity = String(fromOpacity + (toOpacity - fromOpacity) * Math.min(1, t * 1.5));
    } else if (type === "fade") {
      camera.position.z = toZ;
      gl.domElement.style.opacity = String(fromOpacity + (toOpacity - fromOpacity) * t);
    }
    if (progress.current >= 1) {
      introComplete.current = true;
      gl.domElement.style.opacity = "1";
      camera.position.z = toZ;
      if (!completeFired.current) {
        completeFired.current = true;
        onComplete?.();
      }
    }
  });
  return null;
}
function LoopAnimation({ type, speed, reverse, meshRef }) {
  const elapsed = useRef(0);
  const initialY = useRef(null);
  const dir = reverse ? -1 : 1;
  useFrame((_, delta) => {
    if (type === "none" || !meshRef.current) return;
    elapsed.current += delta * speed;
    const t = elapsed.current;
    if (initialY.current === null) {
      initialY.current = meshRef.current.position.y;
    }
    switch (type) {
      case "spin":
        meshRef.current.rotation.y += delta * 0.5 * speed * dir;
        break;
      case "float":
        meshRef.current.position.y = initialY.current + Math.sin(t * 1.5) * 0.3;
        break;
      case "pulse": {
        const pulse = 1 + Math.sin(t * 2) * 0.05;
        const sx = meshRef.current.scale.x;
        const sy = meshRef.current.scale.y;
        const sz = meshRef.current.scale.z;
        meshRef.current.scale.set(
          Math.sign(sx) * Math.abs(sx / (1 + Math.sin((t - delta * speed) * 2) * 0.05)) * pulse,
          Math.sign(sy) * Math.abs(sy / (1 + Math.sin((t - delta * speed) * 2) * 0.05)) * pulse,
          Math.sign(sz) * Math.abs(sz / (1 + Math.sin((t - delta * speed) * 2) * 0.05)) * pulse
        );
        break;
      }
      case "wobble":
        meshRef.current.rotation.z = Math.sin(t * 2) * 0.1 * dir;
        break;
      case "swing":
        meshRef.current.rotation.y = Math.sin(t * 1.5) * 0.26 * dir;
        break;
      case "spinFloat":
        meshRef.current.rotation.y += delta * 0.4 * speed * dir;
        meshRef.current.position.y = initialY.current + Math.sin(t * 1.2) * 0.25;
        break;
    }
  });
  return null;
}
function SmoothControls({
  rotationX,
  rotationY,
  meshRef,
  cursorOrbit,
  orbitStrength,
  draggable,
  scrollZoom,
  zoom,
  resetOnIdle,
  resetDelay,
  resetKey
}) {
  const { gl, camera } = useThree();
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const baseRotation = useRef({ x: rotationX, y: rotationY });
  const targetRotation = useRef({ x: rotationX, y: rotationY });
  const targetZoom = useRef(zoom);
  useEffect2(() => {
    baseRotation.current.x = rotationX;
    baseRotation.current.y = rotationY;
    targetRotation.current.x = rotationX;
    targetRotation.current.y = rotationY;
    velocity.current.x = 0;
    velocity.current.y = 0;
  }, [rotationX, rotationY, resetKey]);
  useEffect2(() => {
    targetZoom.current = zoom;
  }, [zoom]);
  const velocity = useRef({ x: 0, y: 0 });
  const cursorOffset = useRef({ x: 0, y: 0 });
  const lastInteraction = useRef(performance.now());
  const isResetting = useRef(false);
  const cursorInWindow = useRef(true);
  const damping = 0.08;
  const friction = 0.92;
  const orbitDamping = 0.04;
  const resetDamping = 0.03;
  const markActive = () => {
    lastInteraction.current = performance.now();
    isResetting.current = false;
  };
  useFrame(() => {
    if (!meshRef.current) return;
    let resetting = false;
    if (resetOnIdle && introComplete.current) {
      const idle = performance.now() - lastInteraction.current;
      resetting = !isDragging.current && (!cursorInWindow.current || idle > resetDelay * 1e3);
    }
    if (!isDragging.current && !resetting) {
      velocity.current.x *= friction;
      velocity.current.y *= friction;
      if (Math.abs(velocity.current.x) > 1e-4 || Math.abs(velocity.current.y) > 1e-4) {
        baseRotation.current.x += velocity.current.x;
        baseRotation.current.y += velocity.current.y;
      }
    }
    if (resetting) {
      velocity.current.x = 0;
      velocity.current.y = 0;
      baseRotation.current.x += (rotationX - baseRotation.current.x) * resetDamping;
      baseRotation.current.y += (rotationY - baseRotation.current.y) * resetDamping;
      cursorOffset.current.x += (0 - cursorOffset.current.x) * resetDamping;
      cursorOffset.current.y += (0 - cursorOffset.current.y) * resetDamping;
      targetZoom.current += (zoom - targetZoom.current) * resetDamping;
    }
    targetRotation.current.x = baseRotation.current.x + (cursorOrbit ? cursorOffset.current.x : 0);
    targetRotation.current.y = baseRotation.current.y + (cursorOrbit ? cursorOffset.current.y : 0);
    const cur = meshRef.current.rotation;
    cur.x += (targetRotation.current.x - cur.x) * (cursorOrbit && !isDragging.current ? orbitDamping : damping);
    cur.y += (targetRotation.current.y - cur.y) * (cursorOrbit && !isDragging.current ? orbitDamping : damping);
    if (introComplete.current) {
      const aspect = gl.domElement.clientWidth / (gl.domElement.clientHeight || 1);
      const responsiveFactor = aspect < 1 ? 1 / aspect : 1;
      const effectiveZoom = targetZoom.current * responsiveFactor;
      camera.position.z += (effectiveZoom - camera.position.z) * damping;
    }
  });
  useEffect2(() => {
    if (!resetOnIdle) return;
    const onDocLeave = () => {
      cursorInWindow.current = false;
    };
    const onDocEnter = () => {
      cursorInWindow.current = true;
      markActive();
    };
    document.addEventListener("mouseleave", onDocLeave);
    document.addEventListener("mouseenter", onDocEnter);
    return () => {
      document.removeEventListener("mouseleave", onDocLeave);
      document.removeEventListener("mouseenter", onDocEnter);
    };
  }, [resetOnIdle]);
  useEffect2(() => {
    if (!cursorOrbit) {
      cursorOffset.current = { x: 0, y: 0 };
      return;
    }
    const onMouseMove = (e) => {
      if (isDragging.current) return;
      if (resetOnIdle) markActive();
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      cursorOffset.current = {
        x: ny * orbitStrength,
        y: nx * orbitStrength
      };
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [cursorOrbit, orbitStrength, resetOnIdle]);
  useEffect2(() => {
    const canvas = gl.domElement;
    const activeTouches = /* @__PURE__ */ new Set();
    const isPinching = () => activeTouches.size >= 2;
    const onPointerDown = (e) => {
      activeTouches.add(e.pointerId);
      if (!draggable || isPinching()) return;
      isDragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      velocity.current = { x: 0, y: 0 };
      canvas.setPointerCapture(e.pointerId);
      if (resetOnIdle) markActive();
    };
    const onPointerMove = (e) => {
      if (!isDragging.current || isPinching()) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      const sensitivity = 0.01;
      baseRotation.current.x += dy * sensitivity;
      baseRotation.current.y += dx * sensitivity;
      velocity.current = { x: dy * sensitivity, y: dx * sensitivity };
    };
    const onPointerUp = (e) => {
      activeTouches.delete(e.pointerId);
      if (!isDragging.current) return;
      if (activeTouches.size > 0) {
        velocity.current = { x: 0, y: 0 };
      }
      isDragging.current = false;
      canvas.releasePointerCapture(e.pointerId);
      if (resetOnIdle) markActive();
    };
    const onWheel = (e) => {
      if (!scrollZoom) return;
      e.preventDefault();
      targetZoom.current = Math.max(2, Math.min(20, targetZoom.current + e.deltaY * 0.01));
      if (resetOnIdle) markActive();
    };
    let lastPinchDist = 0;
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && scrollZoom) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = lastPinchDist - dist;
        targetZoom.current = Math.max(2, Math.min(20, targetZoom.current + delta * 0.03));
        lastPinchDist = dist;
        if (resetOnIdle) markActive();
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    if (scrollZoom) {
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    }
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [gl, draggable, scrollZoom, resetOnIdle]);
  return null;
}
var introComplete;
var init_controls = __esm({
  "src/controls.tsx"() {
    "use strict";
    introComplete = { current: false };
  }
});

// src/scene.tsx
var scene_exports = {};
__export(scene_exports, {
  ExtrudedSVG: () => ExtrudedSVG,
  SVG3DScene: () => SVG3DScene,
  default: () => scene_default,
  useExtrudedGeometry: () => useExtrudedGeometry
});
import { useRef as useRef2, useEffect as useEffect3, useState as useState2, useCallback } from "react";
import { Canvas, useThree as useThree2, useFrame as useFrame2 } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { jsx, jsxs } from "react/jsx-runtime";
function recomputeTriplanarUVs(geo, bb) {
  const bbSize = new THREE.Vector3();
  bb.getSize(bbSize);
  const uvAttr = geo.attributes.uv;
  const posAttr = geo.attributes.position;
  const normalAttr = geo.attributes.normal;
  const maxDimUv = Math.max(bbSize.x, bbSize.y, bbSize.z) || 1;
  for (let j = 0; j < uvAttr.count; j++) {
    const px = posAttr.getX(j);
    const py = posAttr.getY(j);
    const pz = posAttr.getZ(j);
    const nx = Math.abs(normalAttr.getX(j));
    const ny = Math.abs(normalAttr.getY(j));
    const nz = Math.abs(normalAttr.getZ(j));
    let u, v;
    if (nz >= nx && nz >= ny) {
      u = (px - bb.min.x) / maxDimUv;
      v = 1 - (py - bb.min.y) / maxDimUv;
    } else if (nx >= ny) {
      u = (pz - bb.min.z) / maxDimUv;
      v = 1 - (py - bb.min.y) / maxDimUv;
    } else {
      u = (px - bb.min.x) / maxDimUv;
      v = (pz - bb.min.z) / maxDimUv;
    }
    uvAttr.setXY(j, u, v);
  }
  uvAttr.needsUpdate = true;
}
function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
function isViewBoxRect(shape, vbW, vbH) {
  const pts = shape.getPoints(4);
  if (pts.length !== 4 && pts.length !== 5) return false;
  const bb = new THREE.Box2();
  for (const p of pts) bb.expandByPoint(p);
  const size = new THREE.Vector2();
  bb.getSize(size);
  const tolerance = 0.01;
  return Math.abs(size.x - vbW) / vbW < tolerance && Math.abs(size.y - vbH) / vbH < tolerance;
}
function parseShapesFromSVG(svgString) {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  const allShapes = [];
  const vbMatch = svgString.match(/viewBox\s*=\s*["']\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/);
  const vbW = vbMatch ? parseFloat(vbMatch[3]) : null;
  const vbH = vbMatch ? parseFloat(vbMatch[4]) : null;
  svgData.paths.forEach((path) => {
    const style = path.userData?.style;
    const hasFill = style?.fill && style.fill !== "none" && style.fill !== "transparent";
    const hasStroke = style?.stroke && style.stroke !== "none" && style.stroke !== "transparent";
    if (hasFill) {
      const shapes = SVGLoader.createShapes(path);
      for (const shape of shapes) {
        if (vbW && vbH && isViewBoxRect(shape, vbW, vbH)) continue;
        allShapes.push(shape);
      }
    }
    if (hasStroke) {
      const strokeWidth = parseFloat(style?.strokeWidth ?? "2");
      const divisions = 12;
      path.subPaths.forEach((subPath) => {
        const points = subPath.getPoints(divisions);
        if (points.length < 2) return;
        const shape = new THREE.Shape();
        const halfWidth = strokeWidth / 2;
        const leftSide = [];
        const rightSide = [];
        for (let i = 0; i < points.length; i++) {
          const curr = points[i];
          const prev = points[Math.max(0, i - 1)];
          const next = points[Math.min(points.length - 1, i + 1)];
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          leftSide.push(new THREE.Vector2(curr.x + nx * halfWidth, curr.y + ny * halfWidth));
          rightSide.push(new THREE.Vector2(curr.x - nx * halfWidth, curr.y - ny * halfWidth));
        }
        shape.moveTo(leftSide[0].x, leftSide[0].y);
        for (let i = 1; i < leftSide.length; i++) shape.lineTo(leftSide[i].x, leftSide[i].y);
        for (let i = rightSide.length - 1; i >= 0; i--) shape.lineTo(rightSide[i].x, rightSide[i].y);
        shape.closePath();
        allShapes.push(shape);
      });
    }
    if (!hasFill && !hasStroke) {
      allShapes.push(...SVGLoader.createShapes(path));
    }
  });
  return allShapes;
}
function useExtrudedGeometry(svgString, depth, smoothness) {
  const [result, setResult] = useState2(EMPTY_RESULT);
  const [loading, setLoading] = useState2(false);
  const [progress, setProgress] = useState2(0);
  const cancelRef = useRef2(false);
  const versionRef = useRef2(0);
  const prevGeosRef = useRef2([]);
  useEffect3(() => {
    const oldGeos = prevGeosRef.current;
    prevGeosRef.current = result.geometries;
    return () => {
      oldGeos.forEach((g) => g.dispose());
    };
  }, [result]);
  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);
  useEffect3(() => {
    if (!svgString) {
      setResult(EMPTY_RESULT);
      setLoading(false);
      setProgress(0);
      return;
    }
    const version = ++versionRef.current;
    cancelRef.current = false;
    setLoading(true);
    setProgress(0);
    (async () => {
      const allShapes = parseShapesFromSVG(svgString);
      if (allShapes.length === 0 || cancelRef.current || version !== versionRef.current) {
        setResult(EMPTY_RESULT);
        setLoading(false);
        return;
      }
      const tempGeo = new THREE.ShapeGeometry(allShapes);
      tempGeo.computeBoundingBox();
      const flatSize = new THREE.Vector3();
      tempGeo.boundingBox.getSize(flatSize);
      const maxFlatDim = Math.max(flatSize.x, flatSize.y, 1);
      tempGeo.dispose();
      const complexity = allShapes.length;
      const qualityScale = complexity > 200 ? 0.3 : complexity > 50 ? 0.6 : 1;
      const scaledDepth = depth / 10 * maxFlatDim;
      const bevelScale = Math.min(maxFlatDim * 0.02, 1);
      const bevelSegments = Math.round((3 + smoothness * 20) * qualityScale);
      const curveSegments = Math.round((24 + smoothness * 176) * qualityScale);
      const bevelThickness = bevelScale * (0.15 + smoothness * 0.2);
      const bevelSize = bevelScale * (0.15 + smoothness * 0.2);
      const extrudeSettings = {
        depth: scaledDepth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments,
        curveSegments
      };
      const individualGeos = [];
      for (let i = 0; i < allShapes.length; i++) {
        if (cancelRef.current || version !== versionRef.current) {
          individualGeos.forEach((g) => g.dispose());
          setLoading(false);
          return;
        }
        individualGeos.push(new THREE.ExtrudeGeometry(allShapes[i], extrudeSettings));
        if ((i + 1) % BATCH_SIZE === 0) {
          setProgress(Math.round((i + 1) / allShapes.length * 90));
          await yieldToMain();
        }
      }
      if (cancelRef.current || version !== versionRef.current) {
        individualGeos.forEach((g) => g.dispose());
        setLoading(false);
        return;
      }
      setProgress(92);
      await yieldToMain();
      const merged = BufferGeometryUtils.mergeGeometries(individualGeos, false);
      individualGeos.forEach((g) => g.dispose());
      if (!merged || cancelRef.current || version !== versionRef.current) {
        setResult(EMPTY_RESULT);
        setLoading(false);
        return;
      }
      setProgress(96);
      await yieldToMain();
      merged.computeBoundingBox();
      merged.computeVertexNormals();
      recomputeTriplanarUVs(merged, merged.boundingBox);
      const bb = merged.boundingBox;
      const ctr = new THREE.Vector3();
      bb.getCenter(ctr);
      const size = new THREE.Vector3();
      bb.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const s = maxDim > 0 ? 4 / maxDim : 1;
      if (cancelRef.current || version !== versionRef.current) {
        merged.dispose();
        setLoading(false);
        return;
      }
      setProgress(100);
      setResult({ geometries: [merged], center: ctr, baseScale: s });
      setLoading(false);
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [svgString, depth, smoothness]);
  return { ...result, loading, progress, cancel };
}
function ExtrudedSVG({
  svgString,
  depth,
  smoothness,
  color,
  materialSettings,
  rotationX,
  rotationY,
  groupRef,
  texture: textureUrl,
  textureRepeat = 1,
  textureRotation = 0,
  textureOffset = [0, 0],
  onLoadingChange
}) {
  const [texture, setTexture] = useState2(null);
  useEffect3(() => {
    if (!textureUrl) {
      setTexture(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.load(textureUrl, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
    });
  }, [textureUrl]);
  useEffect3(() => {
    if (!texture) return;
    texture.offset.set(textureOffset[0], textureOffset[1]);
    texture.repeat.set(textureRepeat, textureRepeat);
    texture.rotation = textureRotation;
    texture.center.set(0.5, 0.5);
    texture.needsUpdate = true;
  }, [texture, textureRepeat, textureRotation, textureOffset]);
  const { geometries, center, baseScale, loading, progress } = useExtrudedGeometry(svgString, depth, smoothness);
  const onLoadingChangeRef = useRef2(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  useEffect3(() => {
    onLoadingChangeRef.current?.(loading, progress);
  }, [loading, progress]);
  return /* @__PURE__ */ jsx(
    "group",
    {
      ref: groupRef,
      rotation: [rotationX, rotationY, 0],
      scale: [baseScale, -baseScale, baseScale],
      children: geometries.map((geometry, i) => {
        const preset = materialPresets[materialSettings.preset];
        const isGold = materialSettings.preset === "gold";
        const isEmissive = materialSettings.preset === "emissive";
        const wantsTransparency = materialSettings.transparent || materialSettings.opacity < 1;
        const baseColor = texture ? "#ffffff" : isGold ? "#d4a017" : color;
        const emissiveColor = isEmissive ? color : "#000000";
        const emissiveIntensity = preset.emissiveIntensity ?? 0;
        const transmissionAmount = wantsTransparency ? 1 - materialSettings.opacity : 0;
        return /* @__PURE__ */ jsx(
          "mesh",
          {
            geometry,
            position: [-center.x, -center.y, -center.z],
            children: /* @__PURE__ */ jsx(
              "meshPhysicalMaterial",
              {
                color: baseColor,
                map: texture ?? void 0,
                metalness: materialSettings.metalness,
                roughness: wantsTransparency ? Math.max(0.02, materialSettings.roughness * 0.3) : materialSettings.roughness,
                transmission: transmissionAmount,
                thickness: wantsTransparency ? 2.5 : 0,
                ior: wantsTransparency ? 1.5 : 1.45,
                opacity: 1,
                transparent: false,
                wireframe: materialSettings.wireframe,
                emissive: emissiveColor,
                emissiveIntensity,
                clearcoat: wantsTransparency ? 1 : preset.clearcoat ?? 0,
                clearcoatRoughness: 0.05,
                side: THREE.FrontSide,
                envMapIntensity: 1
              }
            )
          },
          `${i}-${texture ? "tex" : "notex"}-${materialSettings.preset}-${wantsTransparency}`
        );
      })
    }
  );
}
function ReadyNotifier({ onReady }) {
  const readyFired = useRef2(false);
  const { gl } = useThree2();
  useFrame2(() => {
    if (!readyFired.current) {
      readyFired.current = true;
      const wrapper = gl.domElement.parentElement;
      if (wrapper) wrapper.style.visibility = "visible";
      onReady?.();
    }
  });
  return null;
}
function SVG3DScene({
  svgString,
  depth,
  smoothness,
  color,
  materialSettings,
  rotationX,
  rotationY,
  zoom,
  fov,
  texture,
  textureRepeat,
  textureRotation,
  textureOffset,
  lightPosition,
  lightIntensity,
  ambientIntensity,
  shadow,
  cursorOrbit,
  orbitStrength,
  draggable,
  scrollZoom,
  animate,
  animateSpeed,
  animateReverse,
  resetOnIdle,
  resetDelay,
  intro,
  introDuration,
  introFrom,
  introTo,
  background,
  onReady,
  onAnimationComplete,
  onLoadingChange,
  resetKey,
  registerCanvas,
  children
}) {
  const meshGroupRef = useRef2(null);
  const animGroupRef = useRef2(null);
  useEffect3(() => {
    introComplete.current = false;
  }, []);
  return /* @__PURE__ */ jsxs(
    Canvas,
    {
      camera: { position: [0, 0, zoom], fov },
      style: { background, visibility: "hidden" },
      gl: {
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2
      },
      onCreated: ({ gl, scene }) => {
        if (background && background !== "transparent") {
          scene.background = new THREE.Color(background);
        }
        const canvas = gl.domElement;
        registerCanvas?.(canvas);
        canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          const wrapper = canvas.parentElement;
          if (wrapper) wrapper.style.visibility = "hidden";
        });
        canvas.addEventListener("webglcontextrestored", () => {
          const wrapper = canvas.parentElement;
          if (wrapper) wrapper.style.visibility = "visible";
        });
      },
      children: [
        /* @__PURE__ */ jsx(ReadyNotifier, { onReady }),
        /* @__PURE__ */ jsx(
          IntroAnimation,
          {
            type: intro,
            duration: introDuration,
            from: introFrom,
            to: introTo,
            onComplete: onAnimationComplete
          }
        ),
        /* @__PURE__ */ jsx(
          SmoothControls,
          {
            rotationX,
            rotationY,
            meshRef: meshGroupRef,
            cursorOrbit,
            orbitStrength,
            draggable,
            scrollZoom,
            zoom,
            resetOnIdle,
            resetDelay,
            resetKey
          }
        ),
        /* @__PURE__ */ jsx(LoopAnimation, { type: animate, speed: animateSpeed, reverse: animateReverse, meshRef: animGroupRef }),
        /* @__PURE__ */ jsx("ambientLight", { intensity: ambientIntensity }),
        /* @__PURE__ */ jsx("directionalLight", { position: lightPosition, intensity: lightIntensity, castShadow: true }),
        /* @__PURE__ */ jsx("directionalLight", { position: [-5, 3, -3], intensity: 0.4 }),
        /* @__PURE__ */ jsx("directionalLight", { position: [0, -4, 6], intensity: 0.2 }),
        /* @__PURE__ */ jsx("pointLight", { position: [0, 5, 0], intensity: 0.3 }),
        /* @__PURE__ */ jsx("group", { ref: animGroupRef, children: /* @__PURE__ */ jsx(
          ExtrudedSVG,
          {
            svgString,
            depth,
            smoothness,
            color,
            materialSettings,
            rotationX,
            rotationY,
            groupRef: meshGroupRef,
            texture,
            textureRepeat,
            textureRotation,
            textureOffset,
            onLoadingChange
          }
        ) }),
        shadow && /* @__PURE__ */ jsx(
          ContactShadows,
          {
            position: [0, -3, 0],
            opacity: 0.4,
            scale: 10,
            blur: 2,
            far: 4
          }
        ),
        /* @__PURE__ */ jsx("hemisphereLight", { args: ["#b1e1ff", "#b97a20", 0.5] }),
        /* @__PURE__ */ jsxs(Environment, { background: false, environmentIntensity: 1.5, frames: 1, children: [
          /* @__PURE__ */ jsxs("mesh", { scale: 50, children: [
            /* @__PURE__ */ jsx("sphereGeometry", { args: [1, 32, 32] }),
            /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#0a0a12", side: THREE.BackSide })
          ] }),
          /* @__PURE__ */ jsxs("mesh", { position: [0, 25, 0], children: [
            /* @__PURE__ */ jsx("sphereGeometry", { args: [20, 32, 32] }),
            /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#ffffff" })
          ] }),
          /* @__PURE__ */ jsxs("mesh", { position: [0, 0, 30], children: [
            /* @__PURE__ */ jsx("sphereGeometry", { args: [15, 32, 32] }),
            /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#444444" })
          ] }),
          /* @__PURE__ */ jsxs("mesh", { position: [-20, 5, 10], children: [
            /* @__PURE__ */ jsx("sphereGeometry", { args: [10, 32, 32] }),
            /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#333333" })
          ] })
        ] }),
        children
      ]
    }
  );
}
var _origWarn, EMPTY_RESULT, BATCH_SIZE, scene_default;
var init_scene = __esm({
  "src/scene.tsx"() {
    "use strict";
    init_materials();
    init_controls();
    _origWarn = console.warn;
    console.warn = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("THREE.Clock")) return;
      _origWarn.apply(console, args);
    };
    EMPTY_RESULT = {
      geometries: [],
      center: new THREE.Vector3(),
      baseScale: 1
    };
    BATCH_SIZE = 20;
    scene_default = SVG3DScene;
  }
});

// src/index.tsx
import { useMemo as useMemo2, useState as useState3, useEffect as useEffect4, lazy, Suspense } from "react";

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

// src/index.tsx
init_materials();

// src/use-font.ts
import { useState, useEffect } from "react";
import opentype from "opentype.js";
var FONTS = [
  { name: "DM Sans", url: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf" },
  { name: "Bebas Neue", url: "https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW4.ttf" },
  { name: "Playfair Display", url: "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKfsukDQ.ttf" },
  { name: "Righteous", url: "https://fonts.gstatic.com/s/righteous/v18/1cXxaUPXBpj2rGoU7C9mjw.ttf" },
  { name: "Black Ops One", url: "https://fonts.gstatic.com/s/blackopsone/v21/qWcsB6-ypo7xBdr6Xshe96H3WDw.ttf" },
  { name: "Permanent Marker", url: "https://fonts.gstatic.com/s/permanentmarker/v16/Fh4uPib9Iyv2ucM6pGQMWimMp004Hao.ttf" },
  { name: "Rubik Mono One", url: "https://fonts.gstatic.com/s/rubikmonoone/v20/UqyJK8kPP3hjw6ANTdfRk9YSN-8w.ttf" },
  { name: "Pacifico", url: "https://fonts.gstatic.com/s/pacifico/v23/FwZY7-Qmy14u9lezJ96A.ttf" },
  { name: "Oswald", url: "https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1xZogUE.ttf" },
  { name: "Archivo Black", url: "https://fonts.gstatic.com/s/archivoblack/v23/HTxqL289NzCGg4MzN6KJ7eW6OYs.ttf" }
];
var fontCache = /* @__PURE__ */ new Map();
async function loadFontByName(name, url) {
  if (fontCache.has(name)) return fontCache.get(name);
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const font = opentype.parse(buffer);
  fontCache.set(name, font);
  return font;
}
function useFont(fontName) {
  const [loadedFont, setLoadedFont] = useState(() => {
    return fontCache.get(fontName) ?? null;
  });
  useEffect(() => {
    if (!fontName) return;
    const fontDef = FONTS.find((f) => f.name === fontName);
    if (!fontDef) {
      console.warn(`[useFont] Font "${fontName}" not found in built-in list`);
      return;
    }
    if (fontCache.has(fontName)) {
      setLoadedFont(fontCache.get(fontName));
      return;
    }
    let cancelled = false;
    loadFontByName(fontDef.name, fontDef.url).then((font) => {
      if (!cancelled) setLoadedFont(font);
    }).catch((err) => {
      console.error("[useFont] Font load failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [fontName]);
  return loadedFont;
}
function textToSvg(text, font) {
  const size = 200;
  const available = size - 20;
  let fontSize = 180;
  let fullPath = font.getPath(text, 0, 0, fontSize);
  let bb = fullPath.getBoundingBox();
  let w = bb.x2 - bb.x1;
  let h = bb.y2 - bb.y1;
  while ((w > available || h > available) && fontSize > 8) {
    fontSize -= 4;
    fullPath = font.getPath(text, 0, 0, fontSize);
    bb = fullPath.getBoundingBox();
    w = bb.x2 - bb.x1;
    h = bb.y2 - bb.y1;
  }
  const offsetX = (size - w) / 2 - bb.x1;
  const offsetY = (size - h) / 2 - bb.y1;
  const glyphs = font.stringToGlyphs(text);
  let x = offsetX;
  const paths = [];
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const glyphPath = glyph.getPath(x, offsetY, fontSize);
    const d = glyphPath.toPathData(2);
    if (d) {
      paths.push(`<path d="${d}" fill="black" fill-rule="evenodd"/>`);
    }
    const advance = (glyph.advanceWidth || 0) * (fontSize / (font.unitsPerEm || 1e3));
    if (i < glyphs.length - 1) {
      const kerning = font.getKerningValue(glyphs[i], glyphs[i + 1]);
      x += advance + kerning * (fontSize / (font.unitsPerEm || 1e3));
    } else {
      x += advance;
    }
  }
  if (paths.length === 0) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join("")}</svg>`;
}

// src/index.tsx
init_scene();
init_controls();
init_materials();
import { jsx as jsx2 } from "react/jsx-runtime";
function isSvgUrl(value) {
  const trimmed = value.trimStart();
  if (trimmed.startsWith("<")) return false;
  return /^(https?:\/\/|\/|\.\/|\.\.\/)/.test(trimmed);
}
function useFetchSvg(url) {
  const [fetched, setFetched] = useState3();
  useEffect4(() => {
    if (!url) {
      setFetched(void 0);
      return;
    }
    let cancelled = false;
    fetch(url).then((r) => r.text()).then((text) => {
      if (!cancelled) setFetched(text);
    }).catch(() => {
      if (!cancelled) setFetched(void 0);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return fetched;
}
var SVG3DScene2 = lazy(
  () => Promise.resolve().then(() => (init_scene(), scene_exports)).then((m) => ({ default: m.SVG3DScene }))
);
var FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"></svg>`;
function SVG3D(props) {
  const {
    text,
    font = defaultProps.font,
    svg: svgProp,
    svgString: svgStringProp,
    depth = defaultProps.depth,
    smoothness = defaultProps.smoothness,
    color = defaultProps.color,
    material = defaultProps.material,
    metalness,
    roughness,
    opacity,
    wireframe,
    rotationX = defaultProps.rotationX,
    rotationY = defaultProps.rotationY,
    zoom = defaultProps.zoom,
    fov = defaultProps.fov,
    texture,
    textureRepeat = defaultProps.textureRepeat,
    textureRotation = defaultProps.textureRotation,
    textureOffset = defaultProps.textureOffset,
    lightPosition = defaultProps.lightPosition,
    lightIntensity = defaultProps.lightIntensity,
    ambientIntensity = defaultProps.ambientIntensity,
    shadow = defaultProps.shadow,
    interactive = true,
    cursorOrbit: cursorOrbitProp = defaultProps.cursorOrbit,
    orbitStrength = defaultProps.orbitStrength,
    draggable: draggableProp = defaultProps.draggable,
    scrollZoom: scrollZoomProp = defaultProps.scrollZoom,
    resetOnIdle = defaultProps.resetOnIdle,
    resetDelay = defaultProps.resetDelay,
    resetKey,
    animate = "none",
    animateSpeed = 1,
    animateReverse = false,
    intro = defaultProps.intro,
    introDuration = defaultProps.introDuration,
    introFrom = defaultProps.introFrom,
    introTo: introToProp,
    width = defaultProps.width,
    height = defaultProps.height,
    background = defaultProps.background,
    className,
    onReady,
    onAnimationComplete,
    onLoadingChange,
    registerCanvas,
    children
  } = props;
  const cursorOrbit = interactive ? cursorOrbitProp : false;
  const draggable = interactive ? draggableProp : false;
  const scrollZoom = interactive ? scrollZoomProp : false;
  const containerStyle = {
    width,
    height,
    position: "relative",
    background: "transparent"
  };
  const loadedFont = useFont(text ? font : "");
  const rawSvg = svgProp ?? svgStringProp;
  const svgUrl = rawSvg && isSvgUrl(rawSvg) ? rawSvg : void 0;
  const fetchedSvg = useFetchSvg(svgUrl);
  const svgString = useMemo2(() => {
    if (svgUrl) return fetchedSvg ?? "";
    if (rawSvg !== void 0) return rawSvg;
    if (text && loadedFont) return textToSvg(text, loadedFont);
    if (text && !loadedFont) return "";
    return FALLBACK_SVG;
  }, [text, loadedFont, rawSvg, svgUrl, fetchedSvg]);
  const materialSettings = useMemo2(
    () => resolveMaterial(material, { metalness, roughness, opacity, wireframe }),
    [material, metalness, roughness, opacity, wireframe]
  );
  const loadingEl = /* @__PURE__ */ jsx2("div", { style: containerStyle, className });
  if (!svgString) {
    return loadingEl;
  }
  return /* @__PURE__ */ jsx2("div", { style: containerStyle, className, children: /* @__PURE__ */ jsx2(Suspense, { fallback: loadingEl, children: /* @__PURE__ */ jsx2(
    SVG3DScene2,
    {
      svgString,
      depth,
      smoothness,
      color,
      materialSettings,
      rotationX,
      rotationY,
      zoom,
      fov,
      texture,
      textureRepeat,
      textureRotation,
      textureOffset,
      lightPosition,
      lightIntensity,
      ambientIntensity,
      shadow,
      cursorOrbit,
      orbitStrength,
      draggable,
      scrollZoom,
      resetOnIdle,
      resetDelay,
      resetKey,
      animate,
      animateSpeed,
      animateReverse,
      intro,
      introDuration,
      introFrom,
      introTo: { ...defaultProps.introTo, ...introToProp, zoom: introToProp?.zoom ?? zoom },
      background,
      onReady,
      onAnimationComplete,
      onLoadingChange,
      registerCanvas,
      children
    }
  ) }) });
}
export {
  ExtrudedSVG,
  IntroAnimation,
  LoopAnimation,
  SVG3D,
  SVG3DScene,
  SmoothControls,
  defaultProps,
  introComplete,
  materialPresets,
  resolveMaterial,
  textToSvg,
  useExtrudedGeometry,
  useFont
};
