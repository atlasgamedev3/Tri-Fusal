import { useEffect, useState, useRef, useCallback, useReducer } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as Client from "colyseus.js";
import { toast } from "sonner";
import { GameScreen } from "@/screens/GameScreen";
import type { GameInitPayload } from "@/lib/session-storage";
import { useSounds } from "@/hooks/use-sounds";
import { ResultsOverlay } from "@/components/game/ResultsOverlay";

// Types
type PlayerColor = "RED" | "GREEN" | "BLUE";
type CollectibleType = "network" | "box" | "equilibrium" | "clone" | "vantage";

type CollectibleOrientation = 0 | 90 | 180 | 270;
type CollectibleColor = PlayerColor | "NEUTRAL";

interface PlayerState {
  x: number;
  y: number;
  color: PlayerColor;
  sessionId: string;
  name: string;
}

interface Collectible {
  x: number;
  y: number;
  color: CollectibleColor;
  id: string;
  type: CollectibleType;
  isActivated: boolean;
  isGold: boolean;
  orientation: CollectibleOrientation;
  isFlipped: boolean;
  score: number;
}

type EnemyPersonality = "red-avoiding" | "green-avoiding" | "blue-avoiding" | "same-color-avoiding";

interface EnemyState {
  x: number;
  y: number;
  id: string;
  personality: EnemyPersonality;
}

type BombStatus = "ready" | "running" | "defused" | "detonated";

interface BombPuzzleState {
  id: string;
  label: string;
  isSolved: boolean;
  solvedAt: number;
}

interface ServerGameState {
  players: Map<string, PlayerState>;
  gridColors: Map<string, { color: PlayerColor }>;
  scores: Map<string, number>;
  gridWidth: number;
  gridHeight: number;
  totalScore: number;
  highScore: number;
  gameStarted: boolean;
  countdown: number;
  isGameOver: boolean;
  timeRemaining: number;
  bombStatus: BombStatus;
  bombDuration: number;
  bombRemaining: number;
  solvedPuzzleCount: number;
  requiredPuzzleCount: number;
  bombPuzzles: Map<string, BombPuzzleState> | BombPuzzleState[];
  collectibles: Map<string, Collectible>;
  enemies: Map<string, EnemyState>;
  stage: number;
  stageThresholds: number[];
  seed: number;
}

// Batched game state — updated atomically via reducer
interface GameStateLocal {
  gridWidth: number;
  gridHeight: number;
  players: Map<string, PlayerState>;
  gridColors: Map<string, PlayerColor>;
  collectibles: Collectible[];
  enemies: EnemyState[];
  scores: Record<PlayerColor, number>;
  totalScore: number;
  highScore: number;
  gameStarted: boolean;
  stage: number;
  stageThresholds: number[];
  timeRemaining: number;
  bombStatus: BombStatus;
  bombDuration: number;
  bombRemaining: number;
  solvedPuzzleCount: number;
  requiredPuzzleCount: number;
  bombPuzzles: BombPuzzleState[];
  countdown: number;
  isGameOver: boolean;
  seed: number;
}

type GameAction = { type: "SYNC_STATE"; payload: GameStateLocal };

const initialGameState: GameStateLocal = {
  gridWidth: 10,
  gridHeight: 8,
  players: new Map(),
  gridColors: new Map(),
  collectibles: [],
  enemies: [],
  scores: { RED: 0, GREEN: 0, BLUE: 0 },
  totalScore: 0,
  highScore: 0,
  gameStarted: false,
  stage: 1,
  stageThresholds: [],
  timeRemaining: 15 * 60,
  bombStatus: "ready",
  bombDuration: 15 * 60,
  bombRemaining: 15 * 60,
  solvedPuzzleCount: 0,
  requiredPuzzleCount: 0,
  bombPuzzles: [],
  countdown: 0,
  isGameOver: false,
  seed: 0,
};

function gameReducer(_state: GameStateLocal, action: GameAction): GameStateLocal {
  switch (action.type) {
    case "SYNC_STATE":
      return action.payload;
    default:
      return _state;
  }
}

type Phase = "connecting" | "game";

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("connecting");

  // Init payload comes from the standalone main menu.
  const routerState = location.state as { initPayload?: GameInitPayload } | null;
  const [initPayload] = useState<GameInitPayload | null>(routerState?.initPayload ?? null);

  // Connection state
  const [room, setRoom] = useState<Client.Room<ServerGameState> | null>(null);
  const [myColor, setMyColor] = useState<PlayerColor | null>(null);
  const clientRef = useRef<Client.Client | null>(null);
  const roomRef = useRef<Client.Room<ServerGameState> | null>(null);
  /** Resolved Colyseus room id — known after the initial join (joinOrCreate may
   * create a fresh room). Used so reconnects target the same room. */
  const connectedRoomIdRef = useRef<string | null>(routerState?.initPayload?.roomId ?? null);
  /** Coalesce Colyseus onStateChange bursts into one React update per frame (reduces move jank). */

  // Batched game state — single dispatch = single re-render
  const [gameState, dispatch] = useReducer(gameReducer, initialGameState);

  // UI-only state (not server-synced)
  const [showGo, setShowGo] = useState(false);
  const prevCountdownRef = useRef(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const resultsReasonRef = useRef<"gameover" | "abandoned">("gameover");
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(0.3);
  const { play: playSound } = useSounds();
  const isSpectator = initPayload?.spectator ?? false;

  // Show results overlay when game ends.
  useEffect(() => {
    if (!gameState.isGameOver) return;

    room?.leave();
    resultsReasonRef.current = "gameover";
    setShowResults(true);
  }, [gameState.isGameOver]);

  // Show "GO" briefly when countdown transitions from >0 to 0,
  // and play the movement SFX on each tick from 10 down through GO (0).
  useEffect(() => {
    const prev = prevCountdownRef.current;
    const current = gameState.countdown;
    prevCountdownRef.current = current;

    if (current !== prev && current >= 0 && current <= 10) {
      playSound("move");
    }

    if (prev > 0 && current === 0) {
      setShowGo(true);
      const timer = setTimeout(() => setShowGo(false), 600);
      return () => clearTimeout(timer);
    }
  }, [gameState.countdown, playSound]);

  const createStateUpdater = useCallback((gameRoom: Client.Room<ServerGameState>) => () => {
    if (!gameRoom.state) return;

    const newPlayers = new Map<string, PlayerState>();
    gameRoom.state.players?.forEach((p, id) => {
      newPlayers.set(id, { x: p.x, y: p.y, color: p.color, sessionId: p.sessionId, name: p.name || "" });
      if (id === gameRoom.sessionId && !myColor) setMyColor(p.color);
    });

    const newGridColors = new Map<string, PlayerColor>();
    gameRoom.state.gridColors?.forEach((c, k) => { if (c.color) newGridColors.set(k, c.color); });

    const newCollectibles: Collectible[] = [];
    gameRoom.state.collectibles?.forEach((collectible) => {
      newCollectibles.push({
        x: collectible.x,
        y: collectible.y,
        color: collectible.color,
        id: collectible.id,
        type: collectible.type,
        isActivated: collectible.isActivated,
        isGold: collectible.isGold,
        orientation: collectible.orientation as CollectibleOrientation,
        isFlipped: collectible.isFlipped,
        score: collectible.score || 0,
      });
    });

    const newEnemies: EnemyState[] = [];
    gameRoom.state.enemies?.forEach((enemy) => {
      newEnemies.push({
        x: enemy.x,
        y: enemy.y,
        id: enemy.id,
        personality: enemy.personality as EnemyPersonality,
      });
    });

    const newBombPuzzles: BombPuzzleState[] = [];
    gameRoom.state.bombPuzzles?.forEach((puzzle) => {
      newBombPuzzles.push({
        id: puzzle.id,
        label: puzzle.label,
        isSolved: puzzle.isSolved,
        solvedAt: puzzle.solvedAt || 0,
      });
    });

    dispatch({
      type: "SYNC_STATE",
      payload: {
        gridWidth: gameRoom.state.gridWidth || 10,
        gridHeight: gameRoom.state.gridHeight || 8,
        totalScore: gameRoom.state.totalScore || 0,
        gameStarted: gameRoom.state.gameStarted || false,
        stage: gameRoom.state.stage || 1,
        stageThresholds: Array.from(gameRoom.state.stageThresholds || []),
        seed: gameRoom.state.seed || 0,
        players: newPlayers,
        gridColors: newGridColors,
        collectibles: newCollectibles,
        enemies: newEnemies,
        scores: {
          RED: gameRoom.state.scores?.get("RED") || 0,
          GREEN: gameRoom.state.scores?.get("GREEN") || 0,
          BLUE: gameRoom.state.scores?.get("BLUE") || 0,
        },
        highScore: gameRoom.state.highScore || 0,
        countdown: gameRoom.state.countdown ?? 0,
        isGameOver: gameRoom.state.isGameOver || false,
        timeRemaining: gameRoom.state.timeRemaining ?? 15 * 60,
        bombStatus: gameRoom.state.bombStatus ?? "ready",
        bombDuration: gameRoom.state.bombDuration ?? 15 * 60,
        bombRemaining: gameRoom.state.bombRemaining ?? gameRoom.state.timeRemaining ?? 15 * 60,
        solvedPuzzleCount: gameRoom.state.solvedPuzzleCount ?? 0,
        requiredPuzzleCount: gameRoom.state.requiredPuzzleCount ?? newBombPuzzles.length,
        bombPuzzles: newBombPuzzles,
      },
    });
  }, [myColor]);

  const createStateUpdaterRef = useRef(createStateUpdater);
  createStateUpdaterRef.current = createStateUpdater;

  // Connect to the Colyseus room
  useEffect(() => {
    if (!initPayload || room) return;
    let aborted = false;

    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_BASE_DELAY = 1500;

    function setupRoom(gameRoom: Client.Room<ServerGameState>) {
      const runSync = () => createStateUpdaterRef.current(gameRoom)();
      // Sync immediately on every patch so countdown (and other fields) never sit one frame behind or coalesce wrong.
      gameRoom.onStateChange(runSync);

      gameRoom.onError((code, message) => {
        console.error(`Connection error [${code}]: ${message}`);
      });

      gameRoom.onLeave((code) => {
        console.log(`Disconnected from room (code: ${code})`);
        if (code === 1006) {
          attemptReconnect();
        } else if (code !== 1000 && code !== 1001 && code !== 4000) {
          toast.error("Disconnected from the game.");
        }
      });

      gameRoom.onMessage("boardCleared", () => {
        toast.success("Board cleared!");
      });

      gameRoom.onMessage("puzzleSolved", (message: { label?: string; puzzleId: string }) => {
        toast.success(`${message.label || message.puzzleId} solved`);
      });

      gameRoom.onMessage("bombDefused", () => {
        toast.success("Bomb defused!");
      });

      gameRoom.onMessage("bombDetonated", () => {
        toast.error("Bomb detonated.");
      });

      return runSync;
    }

    async function attemptReconnect() {
      if (aborted) return;
      setIsReconnecting(true);
      setRoom(null);

      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        if (aborted) break;
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(`Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (aborted) break;

        try {
          const client = new Client.Client(initPayload.serverUrl);
          clientRef.current = client;

          // Reconnect to the same room by id (the server restores the player's
          // color from userId). Without a known room id we cannot reconnect.
          const roomId = connectedRoomIdRef.current;
          if (!roomId) {
            console.error("No room id available to reconnect to");
            break;
          }
          const gameRoom = await client.joinById<ServerGameState>(roomId, {
            userId: initPayload.userId,
            playerName: initPayload.playerName,
            spectator: initPayload.spectator,
          });

          const updateState = setupRoom(gameRoom);
          updateState();
          roomRef.current = gameRoom;
          setRoom(gameRoom);
          setIsReconnecting(false);

          // Resume background music if it was paused during disconnect
          const audio = bgMusicRef.current;
          if (audio && audio.paused) {
            audio.play().catch(() => {
              // Autoplay blocked (mobile/strict browsers) — resume on first interaction
              const resume = () => {
                audio.play().catch(() => {});
                window.removeEventListener("pointerdown", resume);
                window.removeEventListener("keydown", resume);
              };
              window.addEventListener("pointerdown", resume, { once: true });
              window.addEventListener("keydown", resume, { once: true });
            });
          }

          console.log("Reconnected successfully!");
          return;
        } catch (e) {
          console.error(`Reconnect attempt ${attempt} failed:`, e);
        }
      }

      // All attempts failed
      setIsReconnecting(false);
      toast.error("Could not reconnect to the game.");
    }

    const connect = async () => {
      try {
        const client = new Client.Client(initPayload.serverUrl);
        clientRef.current = client;

        // Joining/spectating/reconnecting target an explicit Colyseus room id
        // (joinById). Standalone solo/multiplayer always create a fresh room; its
        // server-assigned room id is the shareable code others join by.
        const gameRoom = initPayload.roomId
          ? await client.joinById<ServerGameState>(initPayload.roomId, {
              userId: initPayload.userId,
              playerName: initPayload.playerName,
              spectator: initPayload.spectator,
            })
          : await client.create<ServerGameState>("game_room", {
              soloMode: initPayload.soloMode,
              userId: initPayload.userId,
              playerName: initPayload.playerName,
              devMode: initPayload.devMode,
            });

        connectedRoomIdRef.current = gameRoom.roomId;

        setupRoom(gameRoom);
        /* Hydrate from room.state immediately (reconnect path already calls this).
           Some Colyseus builds may not emit onStateChange until the next patch — without this,
           React can sit on empty initialGameState and show a blank board / wrong zoom. */
        createStateUpdaterRef.current(gameRoom)();

        roomRef.current = gameRoom;
        setRoom(gameRoom);

        // Wait for the first real state patch from Colyseus before showing
        // the game scene. This guarantees gridWidth/gridHeight are non-zero
        // so SmoothZoom initialises with a finite camera zoom.
        let initialised = false;
        gameRoom.onStateChange(() => {
          if (!initialised) {
            initialised = true;
            setPhase("game");
          }
        });
      } catch (e) {
        console.error("Failed to join game room:", e);
        toast.error("Failed to connect to game server.");
      }
    };

    connect();

    return () => {
      aborted = true;
      if (room) room.leave();
    };
  }, [initPayload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transition from connecting to game when gameStarted
  useEffect(() => {
    if (gameState.gameStarted && phase === "connecting" && room) {
      setPhase("game");
    }
  }, [gameState.gameStarted, phase, room]);

  // Background music — start when game phase begins, stop on game over or unmount
  useEffect(() => {
    const url = initPayload?.bgMusicUrl;
    if (!url || phase !== "game") return;

    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.3;
    bgMusicRef.current = audio;
    audio.play().catch(() => {
      // Autoplay blocked — start on first user interaction
      const resume = () => {
        audio.play().catch(() => {});
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    });

    return () => {
      audio.pause();
      audio.src = "";
      bgMusicRef.current = null;
    };
  }, [phase, initPayload?.bgMusicUrl]);

  // Sync volume slider to audio element
  useEffect(() => {
    if (bgMusicRef.current) {
      bgMusicRef.current.volume = bgMusicVolume;
    }
  }, [bgMusicVolume]);

  // Fade out music on game over
  useEffect(() => {
    if (!gameState.isGameOver || !bgMusicRef.current) return;
    const audio = bgMusicRef.current;
    const fade = setInterval(() => {
      if (audio.volume > 0.05) {
        audio.volume = Math.max(0, audio.volume - 0.02);
      } else {
        clearInterval(fade);
        audio.pause();
      }
    }, 100);
    return () => clearInterval(fade);
  }, [gameState.isGameOver]);


  if (!initPayload) {
    return (
      <div className="w-full h-screen bg-canvas flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-slate-300 text-lg mb-2">Session expired</p>
          <p className="text-slate-500 text-sm mb-6">Start or rejoin a room from the main menu.</p>
          <button onClick={() => navigate("/boot", { replace: true })} className="text-sky-400 hover:text-sky-300 underline text-sm">
            Back to main menu
          </button>
        </div>
      </div>
    );
  }

  if (phase === "connecting") {
    return (
      <div className="w-full h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite" aria-label="Connecting to game…">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "rgba(0, 149, 255, 0.3)", borderTopColor: "transparent" }}
            aria-hidden
          />
          <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-200/90">
            Connecting to game…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full bg-canvas text-foreground">
      <GameScreen
        room={room}
        players={gameState.players}
        gridColors={gameState.gridColors}
        collectibles={gameState.collectibles}
        enemies={gameState.enemies}
        gridWidth={gameState.gridWidth}
        gridHeight={gameState.gridHeight}
        myColor={myColor}
        isSoloMode={initPayload?.soloMode || false}
        scores={gameState.scores}
        totalScore={gameState.totalScore}
        highScore={gameState.highScore}
        stage={gameState.stage}
        stageThresholds={gameState.stageThresholds}
        timeRemaining={gameState.timeRemaining}
        bombStatus={gameState.bombStatus}
        bombDuration={gameState.bombDuration}
        bombRemaining={gameState.bombRemaining}
        solvedPuzzleCount={gameState.solvedPuzzleCount}
        requiredPuzzleCount={gameState.requiredPuzzleCount}
        bombPuzzles={gameState.bombPuzzles}
        isDevMode={initPayload?.devMode || false}
        isSpectator={isSpectator}
        seed={gameState.seed}
        isGameOver={gameState.isGameOver}
        countdown={gameState.countdown}
        bgMusicVolume={initPayload?.bgMusicUrl ? bgMusicVolume : undefined}
        onBgMusicVolumeChange={initPayload?.bgMusicUrl ? setBgMusicVolume : undefined}
        challengeName={initPayload?.challengeName}
        onGameAbandoned={() => {
          room?.leave();
          resultsReasonRef.current = "abandoned";
          setShowResults(true);
        }}
      />
      {(gameState.countdown > 0 || showGo) && (() => {
        const from = 10;
        const glowIntensity = showGo ? 0.5 : Math.max(0, (from - gameState.countdown) / from) * 0.35;
        const glowSize = showGo ? 70 : 30 + ((from - gameState.countdown) / from) * 30;

        const getCountStyle = (): CSSProperties => {
          if (showGo) {
            return {
              fontSize: "clamp(6rem, 20vw, 12rem)",
              color: "rgba(173, 234, 255, 1)",
              textShadow:
                "0 0 40px rgba(0, 149, 255, 0.8), 0 0 80px rgba(0, 149, 255, 0.6), 0 0 120px rgba(0, 149, 255, 0.4), 0 0 200px rgba(0, 149, 255, 0.2)",
              transform: "scale(1.2)",
              transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            };
          }
          if (gameState.countdown <= 3) {
            return {
              fontSize: "clamp(5rem, 16vw, 10rem)",
              color: "rgba(255, 255, 255, 1)",
              textShadow:
                "0 0 30px rgba(0, 149, 255, 0.7), 0 0 60px rgba(0, 149, 255, 0.5), 0 0 100px rgba(0, 149, 255, 0.3)",
              transform: `scale(${1 + (4 - gameState.countdown) * 0.05})`,
              transition: "all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
            };
          }
          if (gameState.countdown <= 6) {
            return {
              fontSize: "clamp(4rem, 12vw, 8rem)",
              color: "rgba(255, 255, 255, 0.9)",
              textShadow: "0 0 20px rgba(0, 149, 255, 0.4), 0 0 40px rgba(0, 149, 255, 0.2)",
              transform: "scale(1)",
              transition: "all 0.2s ease-out",
            };
          }
          return {
            fontSize: "clamp(3.5rem, 10vw, 7rem)",
            color: "rgba(255, 255, 255, 0.75)",
            textShadow: "0 0 10px rgba(0, 149, 255, 0.15)",
            transform: "scale(1)",
            transition: "all 0.25s ease-out",
          };
        };

        return (
          <div
            className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none bg-black"
            style={{
              background: `radial-gradient(circle at 50% 50%, rgba(0, 149, 255, ${glowIntensity}) 0%, rgba(0, 60, 120, ${glowIntensity * 0.4}) ${glowSize}%, transparent ${glowSize + 30}%)`,
              transition: "background 0.3s ease",
            }}
          >
            <div
              className="font-extrabold select-none"
              style={{
                ...getCountStyle(),
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
              key={showGo ? "go" : gameState.countdown}
            >
              {showGo ? "GO" : gameState.countdown}
            </div>

            {!showGo && (
              <div
                className="absolute"
                style={{
                  width: "clamp(120px, 30vw, 240px)",
                  height: "clamp(120px, 30vw, 240px)",
                  border: `2px solid rgba(0, 149, 255, ${0.1 + ((from - gameState.countdown) / from) * 0.3})`,
                  borderRadius: "50%",
                  animation: "countdownPulse 1s ease-out infinite",
                }}
              />
            )}

            {showGo && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(circle at 50% 50%, rgba(173, 234, 255, 0.15) 0%, transparent 60%)",
                  animation: "countdownGoFlash 0.6s ease-out forwards",
                }}
              />
            )}

            <style>{`
              @keyframes countdownPulse {
                0% { transform: scale(0.9); opacity: 0.6; }
                50% { transform: scale(1.1); opacity: 0.3; }
                100% { transform: scale(1.3); opacity: 0; }
              }
              @keyframes countdownGoFlash {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(2); }
              }
            `}</style>
          </div>
        );
      })()}
      {isReconnecting && (
        <div className="fixed inset-0 bg-canvas/85 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "rgba(0, 149, 255, 0.3)", borderTopColor: "transparent" }}
              aria-hidden
            />
            <div className="flex flex-col items-center gap-1">
              <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-100">Server disconnected.</p>
              <p className="font-montreal text-[0.6875rem] uppercase tracking-[0.06em] text-sky-300/90">Reconnecting…</p>
            </div>
          </div>
        </div>
      )}
      {showResults && (
        <ResultsOverlay
          totalScore={gameState.totalScore}
          highScore={gameState.highScore}
          stage={gameState.stage}
          scores={gameState.scores}
          soloMode={initPayload?.soloMode || false}
          reason={resultsReasonRef.current}
          players={Array.from(gameState.players.values()).map((p) => ({
            name: p.name,
            color: p.color,
          }))}
          onBack={() => {
            navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
};

export default Index;
