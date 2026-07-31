import opentype from 'opentype.js';

/**
 * =============================================================================
 * Font Loader
 * =============================================================================
 *
 * Google Font loading and text-to-SVG conversion. Fetches .ttf files,
 * caches parsed opentype.Font instances, and converts text strings into
 * per-glyph SVG paths ready for 3D extrusion.
 *
 * @packageDocumentation
 */

declare function useFont(fontName: string): opentype.Font | null;
declare function textToSvg(text: string, font: opentype.Font): string;

export { textToSvg, useFont };
