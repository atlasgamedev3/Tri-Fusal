export interface GameInitPayload {
  /** Omitted when creating a fresh room; present when joining an existing room. */
  roomId?: string;
  serverUrl: string;
  userId: string;
  playerName: string;
  soloMode: boolean;
  devMode?: boolean;
  levelSpec?: string;
  seed?: number;
  bgMusicUrl?: string;
  spectator?: boolean;
  challengeName?: string;
}

/** Clear stale session data left by previous versions. */
export function clearSession(): void {
  try {
    sessionStorage.removeItem("tri_fusal_active_session");
    sessionStorage.removeItem("pw_active_session");
  } catch {
    // noop
  }
}
