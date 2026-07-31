"use client";

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
export {
  textToSvg,
  useFont
};
