import { BaseCollectible, CollectibleScoreContext, SpawnValidationContext } from "./BaseCollectible";

/**
 * Vantage Collectible (Colored)
 *
 * Spawns between nodes (at half-integer positions, e.g., x=5.5, y=7.5).
 * Looks in each cardinal direction for the first "edge" (perpendicular to the
 * direction of looking) where both nodes are the same color as the collectible.
 *
 * Example: Vantage at (5.5, 7.5) looking down (positive Y):
 * - Distance 1: checks edge between (5,8) and (6,8)
 * - Distance 2: checks edge between (5,9) and (6,9)
 * - etc.
 *
 * Scores based on how many different distances are found:
 * - 1 unique distance: 5 points
 * - 2 unique distances: 15 points
 * - 3 unique distances: 25 points
 * - 4 unique distances: 40 points
 */
export class VantageCollectible extends BaseCollectible {
  private readonly SCORES = [0, 5, 15, 25, 40];

  /**
   * Find the distance to the first perpendicular edge of the given color in a direction.
   * The vantage is at a half-integer position (e.g., 5.5, 7.5).
   * When looking in direction (dx, dy), we check perpendicular edges.
   */
  private findFirstEdgeDistance(
    startX: number,
    startY: number,
    dx: number,
    dy: number,
    color: string,
    gridColors: CollectibleScoreContext["gridColors"],
    maxBound: number
  ): number | null {
    const baseX = Math.floor(startX);
    const baseY = Math.floor(startY);

    let distance = 1;

    // Moving along the direction - find the FIRST edge (any color), only count if it matches
    if (dx !== 0) {
      // Looking left or right - edges are vertical (between nodes stacked vertically)
      // Distance 1 right: edge between (baseX+1, baseY) and (baseX+1, baseY+1)
      // Distance 1 left: edge between (baseX, baseY) and (baseX, baseY+1)
      let x = dx > 0 ? baseX + 1 : baseX;
      while (x >= 0 && x <= maxBound) {
        const node1Key = `${x},${baseY}`;
        const node2Key = `${x},${baseY + 1}`;

        const node1 = gridColors.get(node1Key);
        const node2 = gridColors.get(node2Key);

        // Check if this is an edge (both nodes same color)
        if (node1 && node2 && node1.color === node2.color) {
          // First edge found - only return distance if it matches our color
          if (node1.color === color) {
            return distance;
          }
          // Edge exists but wrong color - blocked, no valid edge in this direction
          return null;
        }

        x += dx;
        distance++;
      }
    } else {
      // Looking up or down - edges are horizontal (between nodes side by side)
      // Distance 1 down: edge between (baseX, baseY+1) and (baseX+1, baseY+1)
      // Distance 1 up: edge between (baseX, baseY) and (baseX+1, baseY)
      let y = dy > 0 ? baseY + 1 : baseY;
      while (y >= 0 && y <= maxBound) {
        const node1Key = `${baseX},${y}`;
        const node2Key = `${baseX + 1},${y}`;

        const node1 = gridColors.get(node1Key);
        const node2 = gridColors.get(node2Key);

        // Check if this is an edge (both nodes same color)
        if (node1 && node2 && node1.color === node2.color) {
          // First edge found - only return distance if it matches our color
          if (node1.color === color) {
            return distance;
          }
          // Edge exists but wrong color - blocked, no valid edge in this direction
          return null;
        }

        y += dy;
        distance++;
      }
    }

    return null;
  }

  calculateScore(context: CollectibleScoreContext): number {
    const { collectible, gridColors, color } = context;

    // Vantage is a colored collectible - only scores for its matching color
    if (collectible.color !== color) {
      return 0;
    }

    const { foundCount, uniqueLengths } = this.getEdgeInfo(collectible.x, collectible.y, color, gridColors);

    // Only scores if all 4 directions have an edge
    if (foundCount !== 4) {
      return 0;
    }

    const score = this.SCORES[uniqueLengths.size] || 0;

    return score;
  }

  /**
   * Returns { foundCount, uniqueLengths } where:
   * - foundCount: number of directions that have an edge (0-4)
   * - uniqueLengths: Set of unique distances found
   */
  private getEdgeInfo(
    x: number,
    y: number,
    color: string,
    gridColors: CollectibleScoreContext["gridColors"]
  ): { foundCount: number; uniqueLengths: Set<number> } {
    const maxBound = 30;

    // Cardinal directions: up, right, down, left
    const directions = [
      { dx: 0, dy: -1 },  // up
      { dx: 1, dy: 0 },   // right
      { dx: 0, dy: 1 },   // down
      { dx: -1, dy: 0 },  // left
    ];

    const lengths: Set<number> = new Set();
    let foundCount = 0;

    for (const { dx, dy } of directions) {
      const distance = this.findFirstEdgeDistance(x, y, dx, dy, color, gridColors, maxBound);
      if (distance !== null) {
        foundCount++;
        lengths.add(distance);
      }
    }

    return { foundCount, uniqueLengths: lengths };
  }

  isActivated(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors, color } = context;

    if (collectible.color !== color) {
      return false;
    }

    const { foundCount } = this.getEdgeInfo(collectible.x, collectible.y, color, gridColors);
    // Activated only if all 4 directions have an edge
    return foundCount === 4;
  }

  isGold(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors, color } = context;

    if (collectible.color !== color) {
      return false;
    }

    const { foundCount, uniqueLengths } = this.getEdgeInfo(collectible.x, collectible.y, color, gridColors);
    // Gold when all 4 edges exist and are at different distances
    return foundCount === 4 && uniqueLengths.size === 4;
  }

  isValidSpawnPosition(context: SpawnValidationContext): boolean {
    const { x, y, minBound, maxBound, existingCollectibles } = context;

    // Vantage spawns at half-integer positions (between nodes)
    const baseX = Math.floor(x);
    const baseY = Math.floor(y);

    // All four corner nodes must be within bounds
    if (baseX < minBound || baseX + 1 > maxBound) {
      return false;
    }
    if (baseY < minBound || baseY + 1 > maxBound) {
      return false;
    }

    // Check no other vantage collectible is at the same position
    for (const other of existingCollectibles) {
      if (other.type === "vantage" && other.x === x && other.y === y) {
        return false;
      }
    }

    return true;
  }
}
