import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { GameInitPayload } from "@/lib/session-storage";
import { ArrowRight, Radio, Shield, UserRound, Users } from "lucide-react";

const NAME_STORAGE_KEY = "tri-fusal-player-name";

const MainMenu = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [playerName, setPlayerName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const saved = localStorage.getItem(NAME_STORAGE_KEY);
    if (saved) setPlayerName(saved);
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const resolvedName = playerName.trim();

  const startGame = (soloMode: boolean, roomId?: string) => {
    const name = resolvedName;
    if (!name) {
      toast({
        title: "Operative identity required",
        description: "Enter a field name before deployment.",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem(NAME_STORAGE_KEY, name);

    const serverUrl =
      import.meta.env.VITE_SERVER_URL ||
      (import.meta.env.DEV
        ? "ws://localhost:2567"
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`);
    const initPayload: GameInitPayload = {
      serverUrl,
      userId: crypto.randomUUID(),
      playerName: name,
      soloMode,
      roomId,
    };
    navigate("/play", { state: { initPayload } });
  };

  const handleJoinRoom = () => {
    const id = joinRoomId.trim();
    if (id) startGame(false, id);
  };

  const utcTime = clock.toLocaleTimeString("en-GB", {
    hour12: false,
    timeZone: "UTC",
  });

  return (
    <div className="tri-briefing min-h-dvh w-full overflow-hidden">
      <div className="tri-noise" aria-hidden />

      <header className="tri-command-bar">
        <div className="tri-wordmark">
          <span className="tri-mark">TF</span>
          <div>
            <strong>TRI-FUSAL</strong>
            <span>COOPERATIVE DEFUSAL COMMAND</span>
          </div>
        </div>
        <div className="tri-operation">
          <span>ACTIVE DIRECTIVE</span>
          <strong>OPERATION THREEFOLD</strong>
        </div>
        <div className="tri-header-status">
          <span><i /> SECURE LINK</span>
          <strong>{utcTime} ZULU</strong>
        </div>
      </header>

      <main className="tri-briefing-grid">
        <section className="tri-dossier" aria-labelledby="main-menu-title">
          <div className="tri-eyebrow">
            <span>MISSION DOSSIER // TF-03</span>
            <span className="tri-classified">CLASSIFIED</span>
          </div>

          <div className="tri-title-block">
            <p>COOPERATIVE FIELD EXERCISE</p>
            <h1 id="main-menu-title">THREE MINDS.<br />ONE DEVICE.</h1>
            <div className="tri-rule"><span /></div>
            <p className="tri-lede">
              Navigate the signal grid, coordinate three operatives, and
              neutralize every device module before the final countdown.
            </p>
          </div>

          <div className="tri-brief-stats" aria-label="Mission overview">
            <div><span>UNIT SIZE</span><strong>01—03</strong><small>OPERATIVES</small></div>
            <div><span>PROTOCOL</span><strong>TRIAD</strong><small>COOPERATIVE</small></div>
            <div><span>THREAT</span><strong>ACTIVE</strong><small>TIME CRITICAL</small></div>
          </div>

          <div className="tri-field-note">
            <span>FIELD NOTE 07-B</span>
            <p>Every movement alters the network. No operative completes the circuit alone.</p>
          </div>
        </section>

        <section className="tri-deployment" aria-label="Deployment controls">
          <div className="tri-panel-heading">
            <div>
              <span>DEPLOYMENT TERMINAL</span>
              <strong>IDENTIFY &amp; ASSIGN</strong>
            </div>
            <span>STATION 03</span>
          </div>

          <label className="tri-field">
            <span><UserRound size={13} /> OPERATIVE FIELD NAME</span>
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="ENTER CALLSIGN"
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              onKeyDown={(event) => {
                if (event.key === "Enter") startGame(true);
              }}
            />
          </label>

          <div className="tri-mode-label">
            <span>SELECT DEPLOYMENT PROTOCOL</span>
            <small>02 OPTIONS</small>
          </div>

          <div className="tri-mode-grid">
            <button type="button" onClick={() => startGame(true)} className="tri-mode-card">
              <span className="tri-mode-index">01</span>
              <Shield size={23} strokeWidth={1.4} />
              <span className="tri-mode-copy">
                <strong>SOLO COMMAND</strong>
                <small>CONTROL ALL THREE OPERATIVES</small>
              </span>
              <ArrowRight size={18} />
            </button>

            <button type="button" onClick={() => startGame(false)} className="tri-mode-card tri-mode-primary">
              <span className="tri-mode-index">02</span>
              <Users size={23} strokeWidth={1.4} />
              <span className="tri-mode-copy">
                <strong>FORM A UNIT</strong>
                <small>OPEN A MULTIPLAYER ROOM</small>
              </span>
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="tri-divider"><span>OR JOIN ACTIVE FREQUENCY</span></div>

          <div className="tri-join">
            <label>
              <span><Radio size={13} /> ROOM FREQUENCY</span>
              <input
                value={joinRoomId}
                onChange={(event) => setJoinRoomId(event.target.value.toUpperCase())}
                placeholder="ENTER ROOM CODE"
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleJoinRoom();
                }}
              />
            </label>
            <button type="button" onClick={handleJoinRoom} disabled={!joinRoomId.trim()}>
              JOIN UNIT <ArrowRight size={15} />
            </button>
          </div>

          <div className="tri-terminal-log" aria-hidden>
            <span>&gt; COMMAND RELAY ONLINE</span>
            <span>&gt; THREE CHANNELS AVAILABLE</span>
            <span>&gt; AWAITING OPERATIVE IDENTIFICATION<span className="tri-cursor">█</span></span>
          </div>
        </section>
      </main>

      <footer className="tri-footer">
        <span>DEFUSAL COMMAND NETWORK // REV. 3.7.1</span>
        <span>UNAUTHORIZED ACCESS WILL BE LOGGED</span>
        <span>CHANNEL: BRAVO-7</span>
      </footer>
    </div>
  );
};

export default MainMenu;
