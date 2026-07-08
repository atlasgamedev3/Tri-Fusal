import { BaseCollectible, CollectibleScoreContext, SpawnValidationContext } from "./BaseCollectible";

export class BoxCollectible extends BaseCollectible {
  private readonly goldBonus = 5;
  private readonly baseScore = 1;
  private readonly MAX_SEARCH_DISTANCE = 13;

  calculateScore(context: CollectibleScoreContext): number {
    const { collectible, gridColors, color } = context;
    const result = this.findSmallestSquares(collectible.x, collectible.y, color, gridColors);
    if (result === null) return 0;

    const { sideLength, numSquares } = result;
    const isGold = numSquares >= 3;
    const effectiveCount = isGold ? numSquares + this.goldBonus : numSquares;
    return effectiveCount * sideLength * this.baseScore;
  }

  isActivated(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors, color } = context;
    return this.findSmallestSquares(collectible.x, collectible.y, color, gridColors) !== null;
  }

  isGold(context: CollectibleScoreContext): boolean {
    const { collectible, gridColors, color } = context;
    const result = this.findSmallestSquares(collectible.x, collectible.y, color, gridColors);
    return result !== null && result.numSquares >= 3;
  }

  isValidSpawnPosition(context: SpawnValidationContext): boolean {
    const { x, y, minBound, maxBound, existingCollectibles } = context;

    const baseX = Math.floor(x);
    const baseY = Math.floor(y);

    if (baseX < minBound || baseX + 1 > maxBound) return false;
    if (baseY < minBound || baseY + 1 > maxBound) return false;

    for (const other of existingCollectibles) {
      if (other.type === "box" && other.x === x && other.y === y) {
        return false;
      }
    }

    return true;
  }

  private findSmallestSquares(
    centerX: number,
    centerY: number,
    color: string,
    gridColors: CollectibleScoreContext["gridColors"]
  ): { sideLength: number; numSquares: number } | null {
    const clueX = Math.floor(centerX);
    const clueY = Math.floor(centerY);

    let minArea = Infinity;
    let numSquares = 0;

    for (let dy = 0; dy <= this.MAX_SEARCH_DISTANCE; dy++) {
      for (let dx = 0; dx <= this.MAX_SEARCH_DISTANCE; dx++) {
        // Generate square corners using rotation formula
        const topLeft = { x: clueX - dx, y: clueY - dy };
        const topRight = { x: clueX + 1 + dy, y: clueY - dx };
        const bottomLeft = { x: clueX - dy, y: clueY + 1 + dx };
        const bottomRight = { x: clueX + 1 + dx, y: clueY + 1 + dy };

        // Check top-left corner color
        const targetColor = this.getVertexColor(topLeft.x, topLeft.y, gridColors);
        if (targetColor === null) continue;
        if (targetColor !== color) continue;

        // Check all 4 corners match
        if (
          this.getVertexColor(topRight.x, topRight.y, gridColors) !== targetColor ||
          this.getVertexColor(bottomLeft.x, bottomLeft.y, gridColors) !== targetColor ||
          this.getVertexColor(bottomRight.x, bottomRight.y, gridColors) !== targetColor
        ) continue;

        // Calculate area (squared side length)
        const area = (dx + dy + 1) ** 2 + (dy - dx) ** 2;

        if (area < minArea) {
          minArea = area;
          numSquares = 1;
        } else if (area === minArea) {
          numSquares++;
        }
      }
    }

    if (numSquares === 0) return null;

    const sideLength = Math.floor(Math.sqrt(minArea));
    return { sideLength, numSquares };
  }

  private getVertexColor(
    x: number,
    y: number,
    gridColors: CollectibleScoreContext["gridColors"]
  ): string | null {
    const cell = gridColors.get(`${x},${y}`);
    return cell ? cell.color : null;
  }
}
