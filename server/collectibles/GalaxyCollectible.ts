import { BaseCollectible, CollectibleScoreContext, SpawnValidationContext } from "./BaseCollectible";

/**
 * Galaxy Collectible
 *
 * Spawns on nodes (integer positions) and belongs to a player color.
 * Looks for a connected component of the same color that:
 * 1. Has a bounding box with even dimensions (so center falls on a vertex)
 * 2. The galaxy collectible is at the geometric center of the bounding box
 * 3. The component has 180° rotational symmetry around the center
 *
 * Score = BASE_SCORE * (width + bonus) * (height + bonus)
 * where bonus is applied if the collectible itself is not part of the component (gold activation)
 */
export class GalaxyCollectible extends BaseCollectible {
  private readonly BASE_SCORE = 1;
  private readonly GOLD_BONUS = 2;

  protected getSpawnEdgeConstraints(): { minEdge: number; maxEdge: number } {
    return { minEdge: 3, maxEdge: 5 };
  }

  calculateScore(context: CollectibleScoreContext): number {
    const { collectible, components, color } = context;
    const clueX = collectible.x;
    const clueY = collectible.y;

    // Iterate through all connected components of the matching color
    for (const component of components) {
      // Find bounding box of component
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const vertex of component) {
        minX = Math.min(minX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxX = Math.max(maxX, vertex.x);
        maxY = Math.max(maxY, vertex.y);
      }

      // Check if bounding box dimensions are even (so center is on a vertex)
      const width = maxX - minX;
      const height = maxY - minY;
      if (width % 2 !== 0 || height % 2 !== 0) {
        continue;
      }

      // Check if clue is at geometric center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      if (centerX !== clueX || centerY !== clueY) {
        continue;
      }

      // Check for 180° rotational symmetry
      const componentSet = new Set(component.map(v => `${v.x},${v.y}`));
      let hasSymmetry = true;

      for (const vertex of component) {
        // Check if the point rotated 180° around center exists
        const rotatedX = minX + maxX - vertex.x;
        const rotatedY = minY + maxY - vertex.y;
        const rotatedKey = `${rotatedX},${rotatedY}`;

        if (!componentSet.has(rotatedKey)) {
          hasSymmetry = false;
          break;
        }
      }

      if (!hasSymmetry) {
        continue;
      }

      // Calculate score
      // Determine if this is gold activation (clue not in component)
      const clueKey = `${clueX},${clueY}`;
      const isGold = !componentSet.has(clueKey);
      const bonus = isGold ? this.GOLD_BONUS : 0;

      const finalWidth = width + 1;
      const finalHeight = height + 1;
      const score = this.BASE_SCORE * (finalWidth + bonus) * (finalHeight + bonus);

      console.log(
        `Galaxy collectible at (${clueX},${clueY}) for ${color}: ` +
        `bounding box ${finalWidth}x${finalHeight}, gold=${isGold}, score=${score}`
      );

      return score;
    }

    // No valid component found
    return 0;
  }

  isActivated(context: CollectibleScoreContext): boolean {
    return this.calculateScore(context) > 0;
  }

  isGold(context: CollectibleScoreContext): boolean {
    const { collectible, components } = context;
    const clueX = collectible.x;
    const clueY = collectible.y;

    // Check each component for valid galaxy activation
    for (const component of components) {
      // Find bounding box
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const vertex of component) {
        minX = Math.min(minX, vertex.x);
        minY = Math.min(minY, vertex.y);
        maxX = Math.max(maxX, vertex.x);
        maxY = Math.max(maxY, vertex.y);
      }

      // Check even dimensions
      const width = maxX - minX;
      const height = maxY - minY;
      if (width % 2 !== 0 || height % 2 !== 0) {
        continue;
      }

      // Check clue at center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      if (centerX !== clueX || centerY !== clueY) {
        continue;
      }

      // Check 180° rotational symmetry
      const componentSet = new Set(component.map(v => `${v.x},${v.y}`));
      let hasSymmetry = true;

      for (const vertex of component) {
        const rotatedX = minX + maxX - vertex.x;
        const rotatedY = minY + maxY - vertex.y;
        if (!componentSet.has(`${rotatedX},${rotatedY}`)) {
          hasSymmetry = false;
          break;
        }
      }

      if (!hasSymmetry) {
        continue;
      }

      // Gold if the clue position is NOT part of the component
      const clueKey = `${clueX},${clueY}`;
      return !componentSet.has(clueKey);
    }

    return false;
  }

  isValidSpawnPosition(context: SpawnValidationContext): boolean {
    const { x, y, minBound, maxBound, existingCollectibles } = context;

    // Galaxy spawns on nodes (integer positions)
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return false;
    }

    // Must be within bounds, not on the edges
    if (x <= minBound || x >= maxBound || y <= minBound || y >= maxBound) {
      return false;
    }

    // Check no other galaxy collectible is at the same position
    for (const other of existingCollectibles) {
      if (other.type === "galaxy" && other.x === x && other.y === y) {
        return false;
      }
    }

    return true;
  }
}
