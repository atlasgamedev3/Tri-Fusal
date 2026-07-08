import { MapSchema } from "@colyseus/schema";
import { Collectible, GridCell, PlayerColor } from "../schema/GameState";

export interface CollectibleScoreContext {
  collectible: Collectible;
  gridColors: MapSchema<GridCell>;
  allCollectibles: Collectible[];
  color: PlayerColor;
  components: Array<Array<{ x: number; y: number }>>;
}

export interface SpawnValidationContext {
  x: number;
  y: number;
  minBound: number;
  maxBound: number;
  color: PlayerColor;
  existingCollectibles: Collectible[];
  gridMinX?: number;
  gridMaxX?: number;
  gridMinY?: number;
  gridMaxY?: number;
}

export abstract class BaseCollectible {
  /**
   * Calculate the score for this collectible
   * @returns The score contribution for this collectible
   */
  abstract calculateScore(context: CollectibleScoreContext): number;

  /**
   * Determine if this collectible should be activated (lit up)
   * @returns true if the collectible should be activated
   */
  abstract isActivated(context: CollectibleScoreContext): boolean;

  /**
   * Determine if this collectible achieves gold status (bonus condition)
   * @returns true if the collectible meets its gold condition
   */
  isGold(context: CollectibleScoreContext): boolean {
    return false; // Default: no gold status
  }

  /**
   * Validate if a position is valid for spawning this collectible
   * @param context - The context containing position, bounds, color, and existing collectibles
   * @returns true if the position is valid for this collectible type
   */
  abstract isValidSpawnPosition(context: SpawnValidationContext): boolean;

  /**
   * Edge constraint for spawning. Override in subclasses to restrict
   * which edges this collectible can spawn on (1 = outermost border ring).
   */
  protected getSpawnEdgeConstraints(): { minEdge: number; maxEdge: number } {
    return { minEdge: 1, maxEdge: 5 };
  }

  protected isWithinSpawnEdge(context: SpawnValidationContext): boolean {
    const { x, y, gridMinX, gridMaxX, gridMinY, gridMaxY } = context;
    if (gridMinX === undefined || gridMaxX === undefined || gridMinY === undefined || gridMaxY === undefined) {
      return true;
    }
    const { minEdge, maxEdge } = this.getSpawnEdgeConstraints();
    const distFromBorder = Math.min(x - gridMinX, gridMaxX - x, y - gridMinY, gridMaxY - y);
    const edgeNum = Math.floor(distFromBorder) + 1;
    return edgeNum >= minEdge && edgeNum <= maxEdge;
  }

  /**
   * Validates spawn position including edge constraints.
   * Call this from GameRoom instead of isValidSpawnPosition directly.
   */
  validateSpawnPosition(context: SpawnValidationContext): boolean {
    if (!this.isWithinSpawnEdge(context)) return false;
    return this.isValidSpawnPosition(context);
  }

  /**
   * Process this collectible - calculates score and activation state
   * @returns The score contribution
   */
  process(context: CollectibleScoreContext): number {
    const score = this.calculateScore(context);
    const activated = this.isActivated(context);
    if (context.collectible.isActivated !== activated) {
      context.collectible.isActivated = activated;
    }
    const gold = this.isGold(context);
    if (context.collectible.isGold !== gold) {
      context.collectible.isGold = gold;
    }
    return score;
  }
}
