import { BaseCollectible, CollectibleScoreContext, SpawnValidationContext } from "./BaseCollectible";
import { Collectible, PlayerColor, CollectibleOrientation } from "../schema/GameState";
import { MapSchema } from "@colyseus/schema";
import { GridCell } from "../schema/GameState";

/**
 * Clone Collectible (Neutral)
 *
 * Spawns between nodes (at half-integer positions, e.g., x=5.5, y=7.5).
 * Has an orientation (0, 90, 180, or 270 degrees).
 *
 * Each clone reads the 4 nodes around it clockwise starting from top-left.
 * Example: [Red, Green, Blue, Red] at orientation 0.
 *
 * Two clones "match" if their patterns (accounting for orientation) are
 * rotated versions of each other. When two clones match, both score 40 points.
 *
 * Example: Clone A at orientation 0 with pattern [R, G, B, R]
 *          Clone B at orientation 90 must have pattern [R, R, G, B] to match
 *          (the pattern rotated clockwise by 90 degrees)
 */
export class CloneCollectible extends BaseCollectible {
  private readonly baseScore = 4;
  private readonly goldScore = 9;

  /**
   * Get the four corner positions around a clone at position (x, y)
   * Clone positions are at half-integers, so corners are at:
   * - Top-left: (floor(x), floor(y))
   * - Top-right: (ceil(x), floor(y))  -- which is (floor(x)+1, floor(y))
   * - Bottom-right: (ceil(x), ceil(y)) -- which is (floor(x)+1, floor(y)+1)
   * - Bottom-left: (floor(x), ceil(y)) -- which is (floor(x), floor(y)+1)
   */
  private getCornerKeys(x: number, y: number): string[] {
    const baseX = Math.floor(x);
    const baseY = Math.floor(y);

    // Clockwise from top-left: TL, TR, BR, BL
    return [
      `${baseX},${baseY}`,       // top-left
      `${baseX + 1},${baseY}`,   // top-right
      `${baseX + 1},${baseY + 1}`, // bottom-right
      `${baseX},${baseY + 1}`,   // bottom-left
    ];
  }

  /**
   * Get the colors at the 4 corners around a clone, in clockwise order from top-left
   * Returns null if any corner is uncolored
   */
  private getCornerColors(x: number, y: number, gridColors: MapSchema<GridCell>): (PlayerColor | null)[] | null {
    const corners = this.getCornerKeys(x, y);
    const colors: (PlayerColor | null)[] = [];

    for (const key of corners) {
      const cell = gridColors.get(key);
      if (!cell || !cell.color) {
        return null; // Not all corners are colored
      }
      colors.push(cell.color as PlayerColor);
    }

    return colors;
  }

  /**
   * Get the transformed pattern for a clone.
   * 1. Apply rotation (rotate array by N positions)
   * 2. Apply mirror (horizontal flip: swap TL↔TR and BL↔BR)
   */
  private getTransformedPattern(colors: PlayerColor[], orientation: CollectibleOrientation, isFlipped: boolean): PlayerColor[] {
    // Apply rotation: rotate array by N positions
    // A 90° clockwise physical rotation maps [TL,TR,BR,BL] → [BL,TL,TR,BR]
    const rotations = orientation / 90;
    const rotated: PlayerColor[] = [];
    for (let i = 0; i < 4; i++) {
      rotated.push(colors[(i - rotations + 4) % 4]);
    }

    // Apply mirror (horizontal flip: swap TL↔TR and BL↔BR)
    if (isFlipped) {
      // Array is [TL, TR, BR, BL] — swap indices 0↔1 and 2↔3
      [rotated[0], rotated[1]] = [rotated[1], rotated[0]];
      [rotated[2], rotated[3]] = [rotated[3], rotated[2]];
    }

    return rotated;
  }

  /**
   * Check if two patterns match (are the same when both are normalized)
   */
  private patternsMatch(pattern1: PlayerColor[], pattern2: PlayerColor[]): boolean {
    for (let i = 0; i < 4; i++) {
      if (pattern1[i] !== pattern2[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Find all other clone collectibles that match this one
   */
  private findMatchingClones(
    collectible: Collectible,
    allCollectibles: Collectible[],
    gridColors: MapSchema<GridCell>
  ): Collectible[] {
    const myColors = this.getCornerColors(collectible.x, collectible.y, gridColors);
    if (!myColors) {
      return [];
    }

    // Require at least 2 distinct colors in the pattern
    if (new Set(myColors).size < 2) {
      return [];
    }

    const myNormalized = this.getTransformedPattern(myColors as PlayerColor[], collectible.orientation as CollectibleOrientation, collectible.isFlipped);
    const matches: Collectible[] = [];

    for (const other of allCollectibles) {
      // Skip self and non-clone collectibles
      if (other.id === collectible.id || other.type !== "clone") {
        continue;
      }

      const otherColors = this.getCornerColors(other.x, other.y, gridColors);
      if (!otherColors) {
        continue;
      }

      const otherNormalized = this.getTransformedPattern(otherColors as PlayerColor[], other.orientation as CollectibleOrientation, other.isFlipped);

      if (this.patternsMatch(myNormalized, otherNormalized)) {
        matches.push(other);
      }
    }

    return matches;
  }

  calculateScore(context: CollectibleScoreContext): number {
    const { collectible, gridColors, allCollectibles } = context;

    // All 4 corners must be colored with at least 2 distinct colors
    const colors = this.getCornerColors(collectible.x, collectible.y, gridColors);
    if (!colors) return 0;
    if (new Set(colors).size < 2) return 0;

    const matches = this.findMatchingClones(collectible, allCollectibles, gridColors);
    const n = matches.length + 1; // Include self in count

    const bonus = this.isGold(context) ? this.goldScore : this.baseScore;
    return n + bonus;
  }

  isActivated(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors } = context;

    // All 4 corners must be filled with at least 2 distinct colors
    const colors = this.getCornerColors(collectible.x, collectible.y, gridColors);
    if (!colors) {
      return false;
    }

    return new Set(colors).size >= 2;
  }

  isGold(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors } = context;
    const colors = this.getCornerColors(collectible.x, collectible.y, gridColors);
    if (!colors) {
      return false;
    }

    // Gold when all 3 colors are used in the 2x2 grid (no match required)
    return new Set(colors).size === 3;
  }

  isValidSpawnPosition(context: SpawnValidationContext): boolean {
    const { x, y, minBound, maxBound, existingCollectibles } = context;

    // Clone spawns at half-integer positions (between nodes)
    // The position passed in should already be a half-integer
    // Check that all four corner nodes are within bounds
    const baseX = Math.floor(x);
    const baseY = Math.floor(y);

    // All four corners must be within bounds
    if (baseX < minBound || baseX + 1 > maxBound) {
      return false;
    }
    if (baseY < minBound || baseY + 1 > maxBound) {
      return false;
    }

    // Check no other clone collectible is at the same position
    for (const other of existingCollectibles) {
      if (other.type === "clone" && other.x === x && other.y === y) {
        return false;
      }
    }

    return true;
  }
}
