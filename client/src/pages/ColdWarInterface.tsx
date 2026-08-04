import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "analyst" | "technician" | "operator";
type ModuleStatus = "complete" | "active" | "pending" | "failed";
type WireStatus = "intact" | "cut";

interface WireData {
  id: string;
  label: string;
  sublabel: string;
  color: string;
  isSafe: boolean;
  status: WireStatus;
}

interface Objective {
  id: number;
  text: string;
  done: boolean;
}

interface CommsMessage {
  time: string;
  from: string;
  text: string;
}

export interface ColdWarInterfaceProps {
  seconds?: number;
  modules?: { id: string; label: string; status: ModuleStatus; owner: Role }[];
  team?: { code: string; role: string; active: boolean }[];
  initialRole?: Role;
  onPuzzleComplete?: (source: "wire" | "authorization") => void;
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const TOTAL_SECONDS = 14 * 60 + 37;

const MODULES: { id: string; label: string; status: ModuleStatus; owner: Role }[] = [
  { id: "M-01", label: "POWER CELL", status: "complete", owner: "technician" },
  { id: "M-02", label: "SIG ROUTE", status: "active", owner: "analyst" },
  { id: "M-03", label: "AUTH CODE", status: "pending", owner: "operator" },
  { id: "M-04", label: "WIRE ARRAY", status: "pending", owner: "technician" },
  { id: "M-05", label: "FREQ LOCK", status: "pending", owner: "analyst" },
  { id: "M-06", label: "PROTOCOL", status: "pending", owner: "operator" },
];

const TRANSMISSIONS = [
  { id: "T001", time: "14:32:08", freq: "144.500", content: "NOVEMBER BRAVO 7 DELTA — PACKAGE IS ACTIVE", priority: "HIGH" },
  { id: "T002", time: "14:31:44", freq: "144.500", content: "ALPHA STATION THIS IS CONTROL — DO YOU READ OVER", priority: "NORMAL" },
  { id: "T003", time: "14:30:11", freq: "156.800", content: "ZETA PROTOCOL INITIATED — COUNTDOWN NOW RUNNING", priority: "HIGH" },
  { id: "T004", time: "14:28:55", freq: "160.000", content: "████ ██████ ████████ — [CIPHER LOCKED]", priority: "ENCRYPTED" },
  { id: "T005", time: "14:27:30", freq: "144.500", content: "SECTOR 7 CLEAR — MOVING TO SECONDARY POSITION", priority: "NORMAL" },
  { id: "T006", time: "14:25:18", freq: "156.800", content: "CONFIRM — DEVICE IS TYPE IV CONFIGURATION", priority: "HIGH" },
];

const INITIAL_WIRES: WireData[] = [
  { id: "A", label: "CIRCUIT A", sublabel: "PRIMARY POWER BUS", color: "#C4A84F", isSafe: false, status: "intact" },
  { id: "B", label: "CIRCUIT B", sublabel: "SIGNAL RELAY — CLASS III", color: "#5A7040", isSafe: true, status: "intact" },
  { id: "C", label: "CIRCUIT C", sublabel: "DETONATOR LEAD — CRITICAL", color: "#9B2020", isSafe: false, status: "intact" },
  { id: "D", label: "CIRCUIT D", sublabel: "FAILSAFE LOOP — SECONDARY", color: "#2B5EA7", isSafe: true, status: "intact" },
  { id: "E", label: "CIRCUIT E", sublabel: "GROUND RETURN", color: "#888880", isSafe: true, status: "intact" },
];

const INITIAL_OBJECTIVES: Objective[] = [
  { id: 1, text: "VERIFY OPERATIVE IDENTITY -- FIELD ID: 7741-ECHO", done: false },
  { id: 2, text: "CONFIRM PRIMARY DEVICE LOCATION: 47*22N 015*07E", done: true },
  { id: 3, text: "OBTAIN SECONDARY AUTH CODE FROM CIPHER OFFICER", done: false },
  { id: 4, text: "TRANSMIT CLEAR SIGNAL ON CHANNEL BRAVO UPON DEFUSAL", done: false },
  { id: 5, text: "DOCUMENT ALL WIRE CONFIGS FOR POST-MISSION DEBRIEF", done: false },
];

const RADAR_BLIPS = [
  { angle: 45, dist: 0.55, label: "TGT-01", type: "hostile" },
  { angle: 210, dist: 0.35, label: "TGT-02", type: "hostile" },
  { angle: 285, dist: 0.70, label: "UNK-A", type: "unknown" },
  { angle: 120, dist: 0.25, label: "FRND-1", type: "friendly" },
  { angle: 330, dist: 0.62, label: "UNK-B", type: "unknown" },
];

const GAUGES = [
  { label: "INTERNAL PRESSURE", value: 78, unit: "PSI", min: 0, max: 100, safe: [60, 85] },
  { label: "TEMPERATURE", value: 42, unit: "DEG-C", min: 0, max: 100, safe: [20, 60] },
  { label: "CHARGE LEVEL", value: 91, unit: "PCT", min: 0, max: 100, safe: [80, 100] },
];

const INITIAL_COMMS: CommsMessage[] = [
  { time: "14:25:02", from: "CTRL", text: "BLACKTHORN TEAM -- CONFIRM POSITIONS OVER" },
  { time: "14:27:30", from: "ALPHA", text: "ALPHA CONFIRMED -- SECTOR 7 CLEAR" },
  { time: "14:28:55", from: "BRAVO", text: "BRAVO ON-SITE -- DEVICE LOCATED" },
  { time: "14:30:11", from: "CTRL", text: "ZETA PROTOCOL INITIATED -- COUNTDOWN RUNNING" },
  { time: "14:32:08", from: "SABLE", text: "PACKAGE ACTIVE -- BEGIN DEFUSAL SEQUENCE" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function nowTime() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:${d.getSeconds().toString().padStart(2,"0")}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ─── Blinking Cursor ──────────────────────────────────────────────────────────

function Cursor({ color = "#C8861A" }: { color?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <span style={{ color, opacity: on ? 1 : 0 }}>█</span>;
}

// ─── Comms Terminal ───────────────────────────────────────────────────────────

const TERMINAL_THEMES = {
  analyst: {
    bg: "#030804",
    fg: "#4DB86A",
    dim: "rgba(77,184,106,0.38)",
    border: "rgba(77,184,106,0.18)",
    linebg: "none",
    headerBg: "transparent",
    optionBg: "#030804",
    scanline: false,
    font: "'DM Mono', monospace",
    label: "░░ SIGNAL INTERCEPT // CHANNEL-BRAVO // ENCRYPTED // AES-128 ░░",
    sendLabel: "TRANSMIT",
    inputTransform: (s: string) => s.toUpperCase(),
    placeholder: "TYPE MESSAGE -- PRESS ENTER TO TRANSMIT",
  },
  technician: {
    bg: "#060C18",
    fg: "#7EC8E3",
    dim: "rgba(126,200,227,0.38)",
    border: "rgba(126,200,227,0.18)",
    linebg: "none",
    headerBg: "transparent",
    optionBg: "#060C18",
    scanline: false,
    font: "'DM Mono', monospace",
    label: "+--[ FIELD COMMS // SECURE LINE // UNIT BRAVO-7 ]--+",
    sendLabel: "SEND",
    inputTransform: (s: string) => s.toUpperCase(),
    placeholder: "TYPE MESSAGE -- PRESS ENTER TO TRANSMIT",
  },
  operator: {
    bg: "#F0E8D0",
    fg: "#1E1A10",
    dim: "rgba(30,26,16,0.42)",
    border: "rgba(30,26,16,0.18)",
    linebg: "none",
    headerBg: "#1B2A4A",
    optionBg: "#F0E8D0",
    scanline: false,
    font: "'DM Mono', monospace",
    label: "FIELD COMMUNICATIONS LOG — OPERATION BLACKTHORN — CHANNEL BRAVO",
    sendLabel: "SEND",
    inputTransform: (s: string) => s,
    placeholder: "Type message and press Enter to transmit...",
  },
};

function CommsTerminal({ role }: { role: Role }) {
  const [messages, setMessages] = useState<CommsMessage[]>(INITIAL_COMMS);
  const [input, setInput] = useState("");
  const [callsign, setCallsign] = useState("SABLE");
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = TERMINAL_THEMES[role];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, role]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { time: nowTime(), from: callsign, text: theme.inputTransform(text) }]);
    setInput("");
  }, [input, callsign, theme]);

  const isOperator = role === "operator";

  return (
    <div
      style={{
        background: theme.bg,
        borderTop: isOperator ? `2px solid rgba(30,26,16,0.2)` : `1px solid ${theme.border}`,
        fontFamily: theme.font,
        color: theme.fg,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* CRT scanline for analyst */}
      {theme.scanline && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)" }} />
      )}

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isOperator ? "4px 16px" : "3px 12px",
          borderBottom: `1px solid ${theme.border}`,
          fontSize: isOperator ? 9 : 10,
          letterSpacing: isOperator ? "0.15em" : "0.22em",
          background: isOperator ? theme.headerBg : "transparent",
          color: isOperator ? "rgba(232,220,196,0.85)" : theme.dim,
        }}
      >
        <span>{theme.label}</span>
        <span style={{ color: isOperator ? "rgba(232,220,196,0.6)" : theme.dim }}>
          {isOperator ? "CALLSIGN: " : "CALLSIGN: "}
          <select
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            style={{
              background: isOperator ? "#1B2A4A" : "transparent",
              border: "none",
              color: isOperator ? "#E8DEC4" : theme.fg,
              fontFamily: theme.font,
              fontSize: isOperator ? 9 : 10,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {["SABLE", "WREN", "BRIDGE", "CTRL"].map((c) => (
              <option key={c} value={c} style={{ background: theme.optionBg }}>{c}</option>
            ))}
          </select>
        </span>
      </div>

      {/* Message history */}
      <div
        ref={scrollRef}
        style={{
          height: isOperator ? 96 : 88,
          overflowY: "auto",
          padding: isOperator ? "8px 16px" : "6px 12px",
          scrollbarWidth: "none",
          background: theme.linebg,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              fontSize: isOperator ? 11 : 11,
              lineHeight: isOperator ? "20px" : "17px",
              display: "flex",
              gap: isOperator ? 10 : 8,
              fontStyle: isOperator && m.from === "CTRL" ? "italic" : "normal",
            }}
          >
            <span style={{ color: theme.dim, flexShrink: 0 }}>
              {isOperator ? m.time : `[${m.time}]`}
            </span>
            <span style={{ color: isOperator ? "rgba(30,26,16,0.55)" : theme.dim, flexShrink: 0, minWidth: isOperator ? 52 : 44 }}>
              {isOperator ? `${m.from}:` : `${m.from}:`}
            </span>
            <span style={{ color: theme.fg }}>{m.text}</span>
          </div>
        ))}
      </div>

      {/* Input row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: isOperator ? "6px 16px" : "5px 12px",
          borderTop: `1px solid ${theme.border}`,
          background: isOperator ? "#E8DEC4" : "transparent",
        }}
      >
        <span style={{ color: theme.dim, fontSize: 11, flexShrink: 0 }}>
          {isOperator ? `${callsign} >` : `${callsign} >`}
        </span>
        <input
          value={input}
          onChange={(e) => setInput(theme.inputTransform(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={theme.placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: theme.fg,
            fontFamily: theme.font,
            fontSize: 11,
            letterSpacing: isOperator ? "0.02em" : "0.04em",
            caretColor: theme.fg,
          }}
        />
        {!isOperator && <Cursor color={theme.fg} />}
        {isOperator && (
          <span style={{ color: theme.dim, fontSize: 14, animation: "blip-pulse 1.1s ease-in-out infinite" }}>|</span>
        )}
        <button
          onClick={send}
          style={{
            border: `1px solid ${theme.border}`,
            color: theme.dim,
            background: isOperator ? "transparent" : "transparent",
            padding: isOperator ? "3px 14px" : "2px 14px",
            fontSize: 10,
            fontFamily: "'Oswald', sans-serif",
            letterSpacing: "0.15em",
            cursor: "pointer",
            flexShrink: 0,
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = theme.fg;
            (e.currentTarget as HTMLElement).style.borderColor = theme.fg;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = theme.dim;
            (e.currentTarget as HTMLElement).style.borderColor = theme.border;
          }}
        >
          {theme.sendLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Radar Display ────────────────────────────────────────────────────────────

function RadarDisplay() {
  const cx = 50, cy = 50, r = 44;
  return (
    <div className="relative w-full aspect-square">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#120E00" />
            <stop offset="100%" stopColor="#080600" />
          </radialGradient>
          <clipPath id="radarClip">
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="url(#radarGlow)" />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke="#5A4410" strokeWidth="0.35" opacity="0.7" />
        ))}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#5A4410" strokeWidth="0.2" opacity="0.6" />
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#5A4410" strokeWidth="0.2" opacity="0.6" />
        <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke="#5A4410" strokeWidth="0.15" opacity="0.3" />
        <line x1={cx + r * 0.7} y1={cy - r * 0.7} x2={cx - r * 0.7} y2={cy + r * 0.7} stroke="#5A4410" strokeWidth="0.15" opacity="0.3" />
        {/* Sweep */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: "radar-sweep 5s linear infinite" }} clipPath="url(#radarClip)">
          <path d={`M ${cx} ${cy} L ${cx} ${cy - r}`} stroke="#C8861A" strokeWidth="0.7" opacity="0.9" />
          <path d={`M ${cx} ${cy} L ${polar(cx, cy, r, 30).x} ${polar(cx, cy, r, 30).y}`} stroke="#C8861A" strokeWidth="0.4" opacity="0.35" />
          <path d={`M ${cx} ${cy} L ${polar(cx, cy, r, 60).x} ${polar(cx, cy, r, 60).y}`} stroke="#C8861A" strokeWidth="0.2" opacity="0.12" />
        </g>
        {/* Blips */}
        {RADAR_BLIPS.map((blip, i) => {
          const pos = polar(cx, cy, r * blip.dist, blip.angle);
          const col = blip.type === "hostile" ? "#C04040" : blip.type === "friendly" ? "#C8861A" : "#8A7030";
          return (
            <g key={i}>
              <circle cx={pos.x} cy={pos.y} r="1.5" fill={col} opacity="0.9" style={{ animation: "blip-pulse 2s ease-in-out infinite", animationDelay: `${i * 0.4}s` }} />
              <circle cx={pos.x} cy={pos.y} r="3" fill="none" stroke={col} strokeWidth="0.3" opacity="0.35" />
              <text x={pos.x + 2} y={pos.y - 1.5} fill={col} fontSize="2.8" style={{ fontFamily: "'DM Mono', monospace" }} opacity="0.9">{blip.label}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="0.8" fill="#C8861A" />
        <circle cx={cx} cy={cy} r="1.5" fill="none" stroke="#C8861A" strokeWidth="0.3" opacity="0.5" />
        {["25", "50", "75"].map((label, i) => (
          <text key={i} x={cx + 1} y={cy - r * [0.25, 0.5, 0.75][i] + 0.5} fill="#5A4410" fontSize="2.5" style={{ fontFamily: "'DM Mono', monospace" }} opacity="0.8">{label}</text>
        ))}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#7A5820" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

// ─── Analyst Interface ─────────────────────────────────────────────────────────

const AMBER = "#C8861A";
const AMBER_DIM = "rgba(200,134,26,0.4)";
const AMBER_FAINT = "rgba(200,134,26,0.15)";
const AMBER_BORDER = "rgba(200,134,26,0.18)";
const ANALYST_BG = "#070500";

function AnalystInterface() {
  const [frequency, setFrequency] = useState(144.5);
  const [selectedTx, setSelectedTx] = useState<string | null>("T001");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const wavePoints = Array.from({ length: 26 }, (_, i) => {
    const noise = Math.sin((i + tick * 0.3) * 0.9) * 5 + Math.sin((i + tick * 0.1) * 2.3) * 3;
    return `${i * 4},${15 + noise}`;
  }).join(" ");

  const txColor: Record<string, string> = { HIGH: "#C04040", ENCRYPTED: "#8A7030", NORMAL: AMBER };

  return (
    <div
      className="flex h-full overflow-hidden relative"
      style={{ background: ANALYST_BG, color: AMBER, fontFamily: "'DM Mono', monospace" }}
    >
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)" }}
      />

      {/* Left: Radar + Coords */}
      <div className="w-64 flex-shrink-0 flex flex-col" style={{ borderRight: `1px solid ${AMBER_BORDER}` }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${AMBER_BORDER}`, fontSize: 9, letterSpacing: "0.25em", color: AMBER_DIM }}>
          +--[ RADAR // SECTOR-7 // LIVE ]--+
        </div>
        <div style={{ padding: "12px" }}>
          <RadarDisplay />
        </div>
        <div style={{ padding: "0 12px 12px", fontSize: 11 }}>
          <div style={{ color: AMBER_DIM, fontSize: 9, letterSpacing: "0.2em", marginBottom: 6 }}>// COORDINATES</div>
          {[["LAT", "47*22.4'N"], ["LON", "015*07.2'E"], ["ALT", "284M ASL"], ["GRID", "BN-7742"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: AMBER_DIM }}>{k}</span><span>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, borderTop: `1px solid ${AMBER_BORDER}`, paddingTop: 8 }}>
            <div style={{ color: AMBER_DIM, fontSize: 9, letterSpacing: "0.2em", marginBottom: 6 }}>// CONTACTS</div>
            {[{ t: "HOSTILE", n: 2, c: "#C04040" }, { t: "UNKNOWN", n: 2, c: "#8A7030" }, { t: "FRIENDLY", n: 1, c: AMBER }].map(r => (
              <div key={r.t} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: r.c, fontSize: 11 }}>
                <span>{r.t}</span><span>x{r.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center: Transmissions */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: `1px solid ${AMBER_BORDER}` }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${AMBER_BORDER}`, fontSize: 9, letterSpacing: "0.25em", color: AMBER_DIM }}>
          +--[ INTERCEPTED TRANSMISSIONS // DECRYPTION ACTIVE ]--+
        </div>

        {/* Frequency display */}
        <div style={{ padding: "12px", borderBottom: `1px solid ${AMBER_BORDER}` }}>
          <div style={{ fontSize: 9, color: AMBER_DIM, letterSpacing: "0.2em", marginBottom: 4 }}>ACTIVE FREQUENCY</div>
          <div
            style={{
              fontSize: 36,
              fontFamily: "'Oswald', sans-serif",
              color: AMBER,
              letterSpacing: "0.05em",
              textShadow: `0 0 24px ${AMBER}55`,
              lineHeight: 1,
            }}
          >
            {frequency.toFixed(3)}<span style={{ fontSize: 16, opacity: 0.4, marginLeft: 6 }}>MHZ</span>
          </div>
          <input
            type="range" min={140} max={170} step={0.5} value={frequency}
            onChange={(e) => setFrequency(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 8, accentColor: AMBER, cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: AMBER_DIM, marginTop: 2 }}>
            <span>140.0</span><span>155.0</span><span>170.0</span>
          </div>
        </div>

        {/* Waveform */}
        <div style={{ borderBottom: `1px solid ${AMBER_BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 12px 0", fontSize: 9, color: AMBER_DIM, letterSpacing: "0.15em" }}>
            <span>SIGNAL WAVEFORM</span><span style={{ animation: "blip-pulse 1s ease-in-out infinite" }}>● LIVE</span>
          </div>
          <svg viewBox="0 0 100 30" style={{ width: "100%", height: 44 }}>
            <polyline points={wavePoints} fill="none" stroke={AMBER} strokeWidth="0.7" opacity="0.85" />
            <polyline points={wavePoints} fill="none" stroke={AMBER} strokeWidth="3" opacity="0.06" />
          </svg>
        </div>

        {/* Transmission log */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none", padding: "8px 12px" }}>
          {TRANSMISSIONS.map((tx) => (
            <div
              key={tx.id}
              onClick={() => setSelectedTx(tx.id === selectedTx ? null : tx.id)}
              style={{
                border: `1px solid ${selectedTx === tx.id ? AMBER : AMBER_BORDER}`,
                background: selectedTx === tx.id ? AMBER_FAINT : "transparent",
                padding: "6px 8px",
                marginBottom: 6,
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: AMBER_DIM, marginBottom: 4, letterSpacing: "0.1em" }}>
                <span>{tx.time}</span>
                <span>{tx.freq} MHZ</span>
                <span style={{ color: txColor[tx.priority] }}>{tx.priority}</span>
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>{tx.content}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Status */}
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${AMBER_BORDER}`, fontSize: 9, letterSpacing: "0.25em", color: AMBER_DIM }}>
          +--[ STATUS ]--+
        </div>
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", scrollbarWidth: "none" }}>
          <div>
            <div style={{ fontSize: 9, color: AMBER_DIM, letterSpacing: "0.2em", marginBottom: 6 }}>// COMM LOG</div>
            {[["14:32","ALPHA","ACKNOWLEDGED"],["14:31","CTRL","CONFIRM POSITION"],["14:29","ALPHA","PKG SECURED"],["14:27","CTRL","INITIATE ZETA"],["14:25","ALPHA","EN ROUTE 3MIN"]].map(([t, s, m], i) => (
              <div key={i} style={{ fontSize: 10, lineHeight: "18px", borderBottom: `1px solid ${AMBER_BORDER}`, paddingBottom: 2, marginBottom: 2 }}>
                <span style={{ color: AMBER_DIM }}>[{t}] </span>
                <span style={{ opacity: 0.65 }}>{s}: </span>
                <span>{m}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, color: AMBER_DIM, letterSpacing: "0.2em", marginBottom: 6 }}>// SYS STATUS</div>
            {[
              { l: "SIGNAL LOCK", v: "CONFIRMED", ok: true },
              { l: "ENCRYPTION", v: "ACTIVE", ok: true },
              { l: "NOISE FLOOR", v: "-87 DBM", ok: true },
              { l: "CHANNEL-B", v: "NO SIGNAL", ok: false },
            ].map((s) => (
              <div key={s.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, borderBottom: `1px solid ${AMBER_BORDER}`, paddingBottom: 3, marginBottom: 3 }}>
                <span style={{ color: AMBER_DIM }}>{s.l}</span>
                <span style={{ color: s.ok ? AMBER : "#C04040" }}>{s.v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 9, color: AMBER_DIM, letterSpacing: "0.2em", marginBottom: 6 }}>// CIPHER KEY</div>
            <div style={{ border: `1px solid #8A7030`, color: "#8A7030", fontSize: 16, textAlign: "center", padding: "6px", letterSpacing: "0.15em", fontWeight: 600 }}>
              NB-7△-41X
            </div>
            <div style={{ fontSize: 9, color: AMBER_DIM, textAlign: "center", marginTop: 4 }}>USE FOR DECRYPTION</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Blueprint Diagram ─────────────────────────────────────────────────────────

function BlueprintDiagram() {
  return (
    <svg viewBox="0 0 240 160" className="w-full h-full" style={{ fontFamily: "'DM Mono', monospace" }}>
      <defs>
        <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#1A4A7A" strokeWidth="0.3" opacity="0.5" />
        </pattern>
        <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
          <path d="M 0 0 L 4 2 L 0 4 z" fill="#5B9BD5" opacity="0.7" />
        </marker>
      </defs>
      <rect width="240" height="160" fill="url(#grid)" />
      <rect x="30" y="30" width="180" height="100" rx="4" fill="none" stroke="#5B9BD5" strokeWidth="1" opacity="0.8" />
      <rect x="30" y="30" width="180" height="100" rx="4" fill="#0D1E35" opacity="0.6" />
      {/* Timer circuit */}
      <rect x="42" y="42" width="50" height="36" fill="none" stroke="#5B9BD5" strokeWidth="0.8" opacity="0.9" />
      <rect x="42" y="42" width="50" height="36" fill="#0A1828" opacity="0.7" />
      <text x="67" y="55" textAnchor="middle" fill="#7EC8E3" fontSize="4.5" fontWeight="bold">TIMER</text>
      <text x="67" y="62" textAnchor="middle" fill="#7EC8E3" fontSize="3.5" opacity="0.7">CIRCUIT</text>
      <rect x="47" y="64" width="40" height="6" fill="none" stroke="#5B9BD5" strokeWidth="0.4" opacity="0.5" />
      <text x="67" y="68.5" textAnchor="middle" fill="#5B9BD5" fontSize="3">14:37</text>
      {/* Main charge */}
      <rect x="106" y="42" width="72" height="52" fill="none" stroke="#5B9BD5" strokeWidth="0.8" opacity="0.9" />
      <rect x="106" y="42" width="72" height="52" fill="#0A1828" opacity="0.7" />
      <text x="142" y="65" textAnchor="middle" fill="#7EC8E3" fontSize="4.5" fontWeight="bold">MAIN CHARGE</text>
      <text x="142" y="72" textAnchor="middle" fill="#5B9BD5" fontSize="3.2" opacity="0.7">TYPE IV -- 4.2KG HMX</text>
      {[0,8,16,24,32,40,48,56,64,72].map((d,i) => (
        <line key={i} x1={106+Math.max(0,d-52)} y1={42+Math.min(52,d)} x2={106+Math.min(72,d)} y2={42+Math.max(0,d-72)} stroke="#1A4A7A" strokeWidth="0.5" opacity="0.5"/>
      ))}
      {/* Power cell */}
      <rect x="42" y="86" width="50" height="36" fill="none" stroke="#5B9BD5" strokeWidth="0.8" opacity="0.9" />
      <rect x="42" y="86" width="50" height="36" fill="#0A1828" opacity="0.7" />
      <text x="67" y="100" textAnchor="middle" fill="#7EC8E3" fontSize="4.5" fontWeight="bold">POWER</text>
      <text x="67" y="107" textAnchor="middle" fill="#7EC8E3" fontSize="4.5" fontWeight="bold">CELL</text>
      <text x="67" y="115" textAnchor="middle" fill="#5B9BD5" fontSize="3" opacity="0.7">12V / 4.8AH</text>
      {/* Detonator */}
      <rect x="106" y="100" width="32" height="36" fill="none" stroke="#C04040" strokeWidth="0.8" opacity="0.9" />
      <rect x="106" y="100" width="32" height="36" fill="#1A0808" opacity="0.7" />
      <text x="122" y="113" textAnchor="middle" fill="#C04040" fontSize="3.8" fontWeight="bold">DET.</text>
      <text x="122" y="120" textAnchor="middle" fill="#C04040" fontSize="3" opacity="0.8">MKIV</text>
      <text x="122" y="128" textAnchor="middle" fill="#C04040" fontSize="2.8" opacity="0.5">!! CRIT</text>
      {/* Failsafe */}
      <rect x="146" y="100" width="32" height="36" fill="none" stroke="#5B9BD5" strokeWidth="0.8" opacity="0.9" />
      <rect x="146" y="100" width="32" height="36" fill="#0A1828" opacity="0.7" />
      <text x="162" y="113" textAnchor="middle" fill="#7EC8E3" fontSize="3.5" fontWeight="bold">FAILSAFE</text>
      <text x="162" y="121" textAnchor="middle" fill="#5B9BD5" fontSize="3" opacity="0.7">LOOP-B</text>
      {/* Wire paths */}
      <path d="M 92 60 L 106 60" fill="none" stroke="#C4A84F" strokeWidth="1.2" opacity="0.8" strokeDasharray="2,1" />
      <path d="M 67 86 L 67 78" fill="none" stroke="#5A7040" strokeWidth="1.2" opacity="0.8" />
      <path d="M 92 104 L 106 116" fill="none" stroke="#C04040" strokeWidth="1.2" opacity="0.8" strokeDasharray="2,1" />
      <path d="M 80 78 L 80 95 L 162 95 L 162 100" fill="none" stroke="#2B5EA7" strokeWidth="1.2" opacity="0.8" />
      <path d="M 20 130 L 20 15 L 220 15 L 220 130 L 178 130" fill="none" stroke="#888880" strokeWidth="0.6" opacity="0.5" strokeDasharray="3,2" />
      <line x1="178" y1="30" x2="185" y2="18" stroke="#5B9BD5" strokeWidth="0.4" opacity="0.6" />
      <text x="186" y="17" fill="#5B9BD5" fontSize="3" opacity="0.7">OUTER CASING -- TYPE III ALLOY</text>
      <rect x="0" y="148" width="240" height="12" fill="#0A1828" opacity="0.8" />
      <text x="4" y="156" fill="#5B9BD5" fontSize="3.2" opacity="0.8">DWG NO: BRV-7-041 -- DEVICE CROSS-SECTION -- SCALE 1:1 -- REV. C</text>
      <text x="200" y="156" fill="#5B9BD5" fontSize="3.2" opacity="0.8">CLASSIFIED</text>
    </svg>
  );
}

// ─── Technician Interface ──────────────────────────────────────────────────────

function TechnicianInterface({ onPuzzleComplete }: { onPuzzleComplete?: () => void }) {
  const [wires, setWires] = useState<WireData[]>(INITIAL_WIRES);
  const [cutResult, setCutResult] = useState<{ id: string; safe: boolean } | null>(null);

  const cutWire = useCallback((id: string) => {
    const wire = wires.find((w) => w.id === id);
    if (!wire || wire.status === "cut") return;
    setWires((prev) => prev.map((w) => w.id === id ? { ...w, status: "cut" } : w));
    setCutResult({ id, safe: wire.isSafe });
    if (wire.isSafe) onPuzzleComplete?.();
    setTimeout(() => setCutResult(null), 3000);
  }, [wires, onPuzzleComplete]);

  const BP = "#7EC8E3";
  const BP_DIM = "rgba(126,200,227,0.35)";
  const BP_BORDER = "rgba(126,200,227,0.18)";

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#08101E", color: BP, fontFamily: "'DM Mono', monospace" }}>
      {/* Left: Blueprint */}
      <div className="w-80 flex-shrink-0 flex flex-col" style={{ borderRight: `1px solid ${BP_BORDER}` }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BP_BORDER}`, fontSize: 9, letterSpacing: "0.25em", color: BP_DIM }}>
          +--[ DEVICE SCHEMATIC // DWG BRV-7-041 // REV. C ]--+
        </div>
        <div style={{ flex: 1, background: "#060E1A", border: `1px solid ${BP_BORDER}`, margin: 12 }}>
          <BlueprintDiagram />
        </div>
        <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 10, color: BP_DIM }}>
          {[{ col: "#C4A84F", label: "PWR BUS" }, { col: "#5A7040", label: "SIG RELAY" }, { col: "#C04040", label: "DETONATOR" }, { col: "#2B5EA7", label: "FAILSAFE" }, { col: "#888880", label: "GROUND" }].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 16, height: 2, background: l.col, flexShrink: 0 }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Wire puzzle */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: `1px solid ${BP_BORDER}` }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BP_BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: "0.25em", color: BP_DIM }}>+--[ WIRE ARRAY // DEFUSAL SEQUENCE ]--+</span>
          <span style={{ fontSize: 9, color: "#C4A84F", letterSpacing: "0.1em" }}>!! CUT IN CORRECT ORDER !!</span>
        </div>
        {cutResult && (
          <div style={{ margin: 12, marginBottom: 0, padding: "8px 12px", border: `1px solid ${cutResult.safe ? "#5A7040" : "#C04040"}`, color: cutResult.safe ? BP : "#C04040", background: cutResult.safe ? "#0A1E0A" : "#1A0808", fontSize: 11, letterSpacing: "0.05em" }}>
            &gt; CIRCUIT {cutResult.id}: {cutResult.safe ? "SAFE -- SYSTEM NOMINAL" : "DETONATOR TRIGGERED -- ABORT ABORT ABORT"}
          </div>
        )}
        <div style={{ flex: 1, padding: 12, overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {wires.map((wire) => (
            <div
              key={wire.id}
              style={{ border: `1px solid ${BP_BORDER}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, opacity: wire.status === "cut" ? 0.38 : 1 }}
            >
              <span style={{ color: BP_DIM, fontSize: 10, width: 16, flexShrink: 0 }}>{wire.id}</span>
              <div style={{ width: 64, height: 12, display: "flex", alignItems: "center", flexShrink: 0 }}>
                {wire.status === "intact" ? (
                  <div style={{ width: "100%", height: 4, background: wire.color, borderRadius: 1 }} />
                ) : (
                  <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 2 }}>
                    <div style={{ flex: 1, height: 4, background: wire.color, opacity: 0.3 }} />
                    <span style={{ color: wire.color, fontSize: 10 }}>✂</span>
                    <div style={{ flex: 1, height: 4, background: wire.color, opacity: 0.3 }} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontFamily: "'Oswald', sans-serif", letterSpacing: "0.1em" }}>{wire.label}</div>
                <div style={{ fontSize: 9, color: BP_DIM, marginTop: 2 }}>{wire.sublabel}</div>
              </div>
              <span style={{ fontSize: 9, color: wire.status === "cut" ? "#444" : BP_DIM, letterSpacing: "0.1em" }}>
                [{wire.status === "cut" ? "CUT" : "INTACT"}]
              </span>
              {wire.status === "intact" && (
                <button
                  onClick={() => cutWire(wire.id)}
                  style={{ border: `1px solid #C04040`, color: "#C04040", background: "transparent", padding: "3px 12px", fontSize: 10, fontFamily: "'Oswald', sans-serif", letterSpacing: "0.1em", cursor: "pointer", flexShrink: 0 }}
                >
                  CUT
                </button>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${BP_BORDER}` }}>
          <div style={{ fontSize: 9, color: BP_DIM, letterSpacing: "0.2em", marginBottom: 6 }}>// TECHNICIAN FIELD NOTES</div>
          <div style={{ fontSize: 10, color: BP_DIM, lineHeight: 1.6 }}>
            PER CIPHER OFFICER: SAFE CIRCUITS ARE SIGNAL AND FAILSAFE CLASS ONLY.
            DO NOT CUT PRIMARY POWER BEFORE DISABLING GROUND RETURN.
          </div>
        </div>
      </div>

      {/* Right: Gauges */}
      <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BP_BORDER}`, fontSize: 9, letterSpacing: "0.25em", color: BP_DIM }}>
          +--[ INSTRUMENTS ]--+
        </div>
        <div style={{ flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", scrollbarWidth: "none" }}>
          {GAUGES.map((g) => {
            const pct = ((g.value - g.min) / (g.max - g.min)) * 100;
            const inSafe = g.value >= g.safe[0] && g.value <= g.safe[1];
            return (
              <div key={g.label} style={{ border: `1px solid ${BP_BORDER}`, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 6 }}>
                  <span style={{ color: BP_DIM }}>{g.label}</span>
                  <span style={{ color: inSafe ? BP : "#C04040", fontSize: 9 }}>{inSafe ? "[OK]" : "[WARN]"}</span>
                </div>
                <div style={{ fontSize: 22, fontFamily: "'Oswald', sans-serif", color: inSafe ? BP : "#C04040", lineHeight: 1, marginBottom: 8 }}>
                  {g.value}<span style={{ fontSize: 11, opacity: 0.5, marginLeft: 4 }}>{g.unit}</span>
                </div>
                <div style={{ height: 6, background: "rgba(126,200,227,0.08)", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, left: `${((g.safe[0]-g.min)/(g.max-g.min))*100}%`, width: `${((g.safe[1]-g.safe[0])/(g.max-g.min))*100}%`, background: "rgba(126,200,227,0.1)" }} />
                  <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${pct}%`, background: inSafe ? BP : "#C04040", opacity: 0.8 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: BP_DIM, marginTop: 3 }}>
                  <span>{g.min}</span><span>SAFE:{g.safe[0]}-{g.safe[1]}</span><span>{g.max}</span>
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${BP_BORDER}`, paddingTop: 12 }}>
            <div style={{ fontSize: 9, color: BP_DIM, letterSpacing: "0.2em", marginBottom: 8 }}>// COMPONENT STATUS</div>
            {[["OUTER CASING",true],["TIMER CIRCUIT",true],["POWER CELL",true],["MAIN CHARGE",null],["DETONATOR MK4",false],["FAILSAFE LOOP",true]].map(([n, ok]) => (
              <div key={n as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: BP_DIM }}>{n as string}</span>
                <span style={{ color: ok === true ? BP : ok === false ? "#C04040" : "#C4A84F" }}>
                  {ok === true ? "[OK]" : ok === false ? "[FAULT]" : "[CHECK]"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Operator Interface ────────────────────────────────────────────────────────

function OperatorInterface({ onPuzzleComplete }: { onPuzzleComplete?: () => void }) {
  const [objectives, setObjectives] = useState<Objective[]>(INITIAL_OBJECTIVES);
  const [authInput, setAuthInput] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "ok" | "fail">("idle");

  const toggle = (id: number) => setObjectives((prev) => prev.map((o) => o.id === id ? { ...o, done: !o.done } : o));

  const submitAuth = () => {
    const accepted = authInput.trim().toUpperCase() === "DELTA-7-ECHO";
    setAuthStatus(accepted ? "ok" : "fail");
    if (accepted) setAuthInput("");
    if (accepted) onPuzzleComplete?.();
    setTimeout(() => setAuthStatus("idle"), 3000);
  };

  const done = objectives.filter((o) => o.done).length;

  const PAPER = "#F0E8D0";
  const INK = "#1E1A10";
  const FADE = "rgba(30,26,16,0.45)";
  const RULE = "rgba(30,26,16,0.15)";
  const NAVY = "#1B2A4A";
  const RED = "#8B1E1E";

  return (
    <div className="flex h-full overflow-hidden" style={{ background: PAPER, color: INK, fontFamily: "'DM Mono', monospace" }}>
      {/* Left: Dossier cover */}
      <div className="w-72 flex-shrink-0 flex flex-col" style={{ borderRight: `1px solid ${RULE}`, background: "#E8DEC4" }}>
        <div style={{ background: NAVY, color: PAPER, padding: "6px 16px", fontSize: 9, letterSpacing: "0.3em", fontFamily: "'Oswald', sans-serif" }}>
          CLASSIFIED INTELLIGENCE FILE
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* File number + stamp */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 9, color: FADE, letterSpacing: "0.2em", marginBottom: 3 }}>FILE NO.</div>
              <div style={{ fontSize: 14, letterSpacing: "0.1em" }}>BT-1963-7741</div>
            </div>
            <div style={{ border: `2px solid ${RED}`, color: RED, padding: "3px 8px", fontSize: 11, fontFamily: "'Oswald', sans-serif", letterSpacing: "0.2em", fontWeight: 700, transform: "rotate(-8deg)", marginTop: 4 }}>
              TOP SECRET
            </div>
          </div>
          {/* Operation */}
          <div style={{ borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: "12px 0" }}>
            <div style={{ fontSize: 9, color: FADE, letterSpacing: "0.2em", marginBottom: 4 }}>OPERATION</div>
            <div style={{ fontSize: 24, fontFamily: "'Oswald', sans-serif", color: NAVY, fontWeight: 700, lineHeight: 1 }}>BLACKTHORN</div>
            <div style={{ fontSize: 9, color: FADE, marginTop: 4, letterSpacing: "0.08em" }}>INITIATED: 14:20:00 GMT -- 21 JULY 1963</div>
          </div>
          {/* Field identification */}
          <div>
            {[["FIELD ID", "7741-ECHO"], ["CONTACT", "CIPHER OFC. MORSE"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: FADE, minWidth: 72, flexShrink: 0 }}>{k}:</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {/* Location */}
          <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 12 }}>
            <div style={{ fontSize: 9, color: FADE, letterSpacing: "0.2em", marginBottom: 6 }}>PRIMARY LOCATION</div>
            <div style={{ fontSize: 10, lineHeight: 1.8, padding: 8, border: `1px solid ${RULE}`, background: "#E0D6BC" }}>
              GRID: BN-7742{"\n"}
              47*22'N 015*07'E{"\n"}
              ALT: 284M -- ALPINE SECTOR{"\n"}
              ACCESS: TUNNEL-B -- RESTRICTED
            </div>
          </div>
          {/* Threat level */}
          <div>
            <div style={{ fontSize: 9, color: FADE, letterSpacing: "0.2em", marginBottom: 6 }}>THREAT ASSESSMENT</div>
            <div style={{ display: "flex", gap: 2 }}>
              {[1,2,3,4,5].map((l) => (
                <div key={l} style={{ flex: 1, height: 10, background: l <= 4 ? RED : RULE }} />
              ))}
            </div>
            <div style={{ fontSize: 9, color: FADE, marginTop: 4 }}>LEVEL 4 -- CRITICAL</div>
          </div>
          {/* Footer stamp */}
          <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${RULE}` }}>
            <div style={{ display: "inline-block", border: `1px solid rgba(61,74,40,0.4)`, color: "rgba(61,74,40,0.4)", padding: "2px 8px", fontSize: 9, fontFamily: "'Oswald', sans-serif", letterSpacing: "0.15em", transform: "rotate(3deg)" }}>
              FOR OFFICIAL USE ONLY
            </div>
          </div>
        </div>
      </div>

      {/* Center: Objectives + Auth */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: `1px solid ${RULE}` }}>
        <div style={{ padding: "6px 16px", borderBottom: `1px solid ${RULE}`, fontSize: 9, letterSpacing: "0.25em", color: FADE, fontFamily: "'DM Mono', monospace" }}>
          +--[ MISSION OBJECTIVES // OP: BLACKTHORN ]--+
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", scrollbarWidth: "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontFamily: "'Oswald', sans-serif", color: NAVY, letterSpacing: "0.15em" }}>MISSION OBJECTIVES</div>
            <div style={{ fontSize: 9, border: `1px solid ${RULE}`, padding: "2px 8px", letterSpacing: "0.1em", color: FADE }}>{done}/{objectives.length} COMPLETE</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {objectives.map((obj, i) => (
              <div
                key={obj.id}
                onClick={() => toggle(obj.id)}
                style={{ display: "flex", gap: 10, cursor: "pointer" }}
              >
                <div style={{ width: 14, height: 14, border: `1px solid ${obj.done ? "#3D4A28" : RULE}`, background: obj.done ? "#3D4A28" : "transparent", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }}>
                  {obj.done && <span style={{ color: PAPER, fontSize: 9 }}>X</span>}
                </div>
                <div style={{ fontSize: 10, lineHeight: 1.5, opacity: obj.done ? 0.38 : 1, textDecoration: obj.done ? "line-through" : "none" }}>
                  <span style={{ color: FADE, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}.</span>
                  {obj.text}
                </div>
              </div>
            ))}
          </div>

          {/* Auth code */}
          <div style={{ marginTop: 20, borderTop: `1px solid ${RULE}`, paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontFamily: "'Oswald', sans-serif", color: NAVY, letterSpacing: "0.15em", marginBottom: 6 }}>AUTHORIZATION CODE ENTRY</div>
            <div style={{ fontSize: 10, color: FADE, lineHeight: 1.6, marginBottom: 10 }}>
              ENTER THE SECONDARY CODE VALUE PROVIDED BY CIPHER OFFICER MORSE. FORMAT: ALPHA-N-ALPHA.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  value={authInput}
                  onChange={(e) => setAuthInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && submitAuth()}
                  placeholder="DELTA-7-ECHO"
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    border: `1px solid ${authStatus === "ok" ? "#3D4A28" : authStatus === "fail" ? RED : RULE}`,
                    background: "#E0D6BC",
                    color: INK,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    padding: "6px 10px",
                    outline: "none",
                    letterSpacing: "0.12em",
                    boxSizing: "border-box",
                    caretColor: INK,
                  }}
                />
              </div>
              <button
                onClick={submitAuth}
                style={{ border: `1px solid ${NAVY}`, color: NAVY, background: "transparent", padding: "6px 16px", fontSize: 10, fontFamily: "'Oswald', sans-serif", letterSpacing: "0.15em", cursor: "pointer" }}
              >
                SUBMIT
              </button>
            </div>
            {authStatus !== "idle" && (
              <div style={{ marginTop: 6, fontSize: 10, color: authStatus === "ok" ? "#3D4A28" : RED, letterSpacing: "0.05em" }}>
                {authStatus === "ok" ? "> AUTHORIZATION CONFIRMED -- PROTOCOL CHANNEL OPEN" : "> INVALID CODE -- CONTACT CIPHER OFFICER"}
              </div>
            )}
          </div>

          {/* Procedural note */}
          <div style={{ marginTop: 20, borderTop: `1px solid ${RULE}`, paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontFamily: "'Oswald', sans-serif", color: NAVY, letterSpacing: "0.15em", marginBottom: 8 }}>STANDING ORDERS</div>
            <div style={{ fontSize: 10, lineHeight: 1.8, color: FADE, border: `1px solid ${RULE}`, padding: "10px 12px", background: "#E0D6BC" }}>
              "UNDER NO CIRCUMSTANCES DISTURB THE PRIMARY DEVICE BEFORE ALL TEAM MEMBERS HAVE COMPLETED THEIR RESPECTIVE MODULES. COORDINATE WITH STATION ALPHA ON SIGNAL ROUTING BEFORE ANY WIRE INTERVENTION. IF ZETA PROTOCOL IS ACTIVE, ALL ACTIONS REQUIRE DUAL-KEY AUTHORIZATION."
            </div>
            <div style={{ fontSize: 9, color: FADE, marginTop: 6, letterSpacing: "0.1em" }}>-- CIPHER OFFICER J. MORSE, JULY 1963</div>
          </div>
        </div>
      </div>

      {/* Right: Map + Personnel */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", background: "#E8DEC4" }}>
        {/* Map */}
        <div style={{ borderBottom: `1px solid ${RULE}` }}>
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${RULE}`, fontSize: 9, color: FADE, letterSpacing: "0.2em" }}>+--[ OP MAP // SECTOR 7 ]--+</div>
          <div style={{ padding: 10 }}>
            <div style={{ border: `1px solid ${RULE}` }}>
              <svg viewBox="0 0 120 90" style={{ width: "100%", background: "#D8CEB0" }}>
                {[20,40,60,80,100].map((v) => (
                  <g key={v}>
                    <line x1={v} y1={0} x2={v} y2={90} stroke="#C8B89A" strokeWidth="0.3" opacity="0.7" />
                    <line x1={0} y1={v-10} x2={120} y2={v-10} stroke="#C8B89A" strokeWidth="0.3" opacity="0.7" />
                  </g>
                ))}
                <path d="M 0 60 Q 20 50 30 55 Q 40 60 50 52 Q 60 44 80 48 Q 100 52 120 45 L 120 90 L 0 90 Z" fill="#B8AA90" opacity="0.4" />
                <path d="M 60 20 Q 70 10 80 15 Q 90 20 85 35 Q 80 50 70 45 Q 60 40 55 30 Z" fill="#A8A090" opacity="0.3" />
                <path d="M 0 70 Q 40 68 60 55 Q 80 42 120 40" fill="none" stroke="#C8B89A" strokeWidth="1.5" opacity="0.7" />
                <circle cx={75} cy={42} r={3} fill="none" stroke="#8B1E1E" strokeWidth="1" />
                <circle cx={75} cy={42} r={1} fill="#8B1E1E" />
                <line x1={73} y1={40} x2={77} y2={44} stroke="#8B1E1E" strokeWidth="0.5" />
                <line x1={77} y1={40} x2={73} y2={44} stroke="#8B1E1E" strokeWidth="0.5" />
                <text x={79} y={41} fill="#8B1E1E" fontSize="3.5" style={{ fontFamily: "'DM Mono', monospace" }}>TGT</text>
                <rect x={55} y={52} width={10} height={5} fill="#A89870" opacity="0.6" />
                <text x={56} y={56.5} fill="#1E1A10" fontSize="2.8" opacity="0.7" style={{ fontFamily: "'DM Mono', monospace" }}>TNL-B</text>
                <text x={1} y={6} fill="#9A8A70" fontSize="2.5" opacity="0.6" style={{ fontFamily: "'DM Mono', monospace" }}>BN-7742</text>
                <text x={1} y={88} fill="#9A8A70" fontSize="2.5" opacity="0.6" style={{ fontFamily: "'DM Mono', monospace" }}>47*N 015*E</text>
              </svg>
            </div>
            <div style={{ fontSize: 9, color: FADE, marginTop: 5 }}>● TARGET &nbsp;&nbsp; ▪ TUNNEL ACCESS</div>
          </div>
        </div>
        {/* Personnel */}
        <div style={{ flex: 1, padding: 12, overflowY: "auto", scrollbarWidth: "none" }}>
          <div style={{ fontSize: 9, color: FADE, letterSpacing: "0.2em", marginBottom: 10 }}>// PERSONNEL // TEAM BRAVO</div>
          {[
            { code: "SABLE", role: "FIELD OPERATOR", id: "7741-E", status: "ON-SITE" },
            { code: "WREN", role: "INTEL ANALYST", id: "4423-A", status: "REMOTE" },
            { code: "BRIDGE", role: "FIELD TECH", id: "5512-B", status: "ON-SITE" },
          ].map((p) => (
            <div key={p.code} style={{ border: `1px solid ${RULE}`, padding: "8px 10px", marginBottom: 8, background: "#E0D6BC" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13, fontFamily: "'Oswald', sans-serif", color: NAVY, fontWeight: 700 }}>{p.code}</div>
                  <div style={{ fontSize: 9, color: FADE, marginTop: 1 }}>{p.role}</div>
                  <div style={{ fontSize: 9, color: FADE, marginTop: 1 }}>ID: {p.id}</div>
                </div>
                <div style={{ fontSize: 8, border: `1px solid ${p.status === "ON-SITE" ? "#3D4A28" : NAVY}`, color: p.status === "ON-SITE" ? "#3D4A28" : NAVY, padding: "2px 6px", letterSpacing: "0.1em", marginTop: 2 }}>{p.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shared HUD ────────────────────────────────────────────────────────────────

function SharedHUD({ seconds, activeRole, setActiveRole, modules = MODULES, team }: {
  seconds: number;
  activeRole: Role;
  setActiveRole: (r: Role) => void;
  modules?: { id: string; label: string; status: ModuleStatus; owner: Role }[];
  team?: { code: string; role: string; active: boolean }[];
}) {
  const isCritical = seconds < 3 * 60;
  const isUrgent = seconds < 7 * 60;
  const timeStr = formatTime(seconds);

  return (
    <div style={{ background: "#0A0A08", fontFamily: "'Oswald', sans-serif", borderBottom: "1px solid rgba(200,134,26,0.15)", flexShrink: 0 }}>
      {/* Classification banner */}
      <div style={{ background: "#8B1E1E", color: "#F0E8D0", textAlign: "center", padding: "3px 0", fontSize: 9, letterSpacing: "0.35em", fontFamily: "'DM Mono', monospace" }}>
        ▓ TOP SECRET // OPERATION BLACKTHORN // AUTHORIZED PERSONNEL ONLY ▓
      </div>

      {/* Main HUD row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "10px 16px", gap: "24px" }}>
        {/* Left: Modules */}
        <div>
          <div style={{ fontSize: 9, color: "rgba(200,134,26,0.4)", letterSpacing: "0.25em", marginBottom: 6, fontFamily: "'DM Mono', monospace" }}>
            // MODULE PROGRESSION
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {modules.map((m) => {
              const bg = m.status === "complete" ? "#3D4A28" : m.status === "active" ? "#C4A84F" : m.status === "failed" ? "#8B1E1E" : "#1A1A14";
              const col = m.status === "active" ? "#0A0A08" : m.status === "pending" ? "rgba(200,134,26,0.25)" : "#E8DEC4";
              return (
                <div key={m.id} style={{ background: bg, color: col, padding: "4px 6px", minWidth: 52, textAlign: "center" }}>
                  <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", opacity: 0.7 }}>{m.id}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.04em" }}>{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Timer */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "rgba(200,134,26,0.4)", letterSpacing: "0.25em", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>TIME REMAINING</div>
          <div
            style={{
              fontSize: 52,
              fontFamily: "'DM Mono', monospace",
              fontWeight: 500,
              letterSpacing: "0.06em",
              lineHeight: 1,
              color: isCritical ? "#C04040" : isUrgent ? "#C4A84F" : "#E8DEC4",
              textShadow: isCritical ? "0 0 32px #C0404066" : isUrgent ? "0 0 20px #C4A84F44" : "0 0 20px rgba(232,220,196,0.15)",
              animation: isCritical ? "timer-pulse 1s ease-in-out infinite" : "none",
            }}
          >
            {timeStr}
          </div>
          <div style={{ fontSize: 9, marginTop: 4, letterSpacing: "0.2em", fontFamily: "'DM Mono', monospace", color: isCritical ? "#C04040" : "rgba(200,134,26,0.35)" }}>
            {isCritical ? "!! CRITICAL -- DEFUSE IMMEDIATELY !!" : isUrgent ? "-- URGENT -- PROCEED WITH HASTE --" : "-- NOMINAL --"}
          </div>
        </div>

        {/* Right: Team status */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div>
            <div style={{ fontSize: 9, color: "rgba(200,134,26,0.4)", letterSpacing: "0.25em", marginBottom: 6, textAlign: "right", fontFamily: "'DM Mono', monospace" }}>
              // TEAM STATUS
            </div>
            {(team ?? [
              { code: "WREN", role: "ANALYST", active: true },
              { code: "BRIDGE", role: "TECHNICIAN", active: true },
              { code: "SABLE", role: "OPERATOR", active: true },
            ]).map((m) => (
              <div key={m.code} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                <div style={{ width: 6, height: 6, background: m.active ? "#5A7040" : "#4A4A3E", borderRadius: "50%", animation: m.active ? "blip-pulse 2.5s ease-in-out infinite" : "none", flexShrink: 0 }} />
                <span style={{ color: "rgba(232,220,196,0.7)", fontSize: 10, letterSpacing: "0.1em" }}>{m.code}</span>
                <span style={{ color: "rgba(232,220,196,0.3)", fontSize: 9, letterSpacing: "0.08em" }}>{m.role}</span>
                <span style={{ color: m.active ? "#5A7040" : "rgba(232,220,196,0.3)", marginLeft: "auto", fontSize: 9, letterSpacing: "0.1em" }}>
                  [{m.active ? "ACTIVE" : "OFFLINE"}]
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Role tabs */}
      <div style={{ display: "flex", borderTop: "1px solid rgba(200,134,26,0.1)" }}>
        {(["analyst", "technician", "operator"] as Role[]).map((r) => {
          const labels: Record<Role, [string, string]> = {
            analyst: ["ANALYST", "STATION ALPHA"],
            technician: ["TECHNICIAN", "UNIT BRAVO-7"],
            operator: ["OPERATOR", "OP: BLACKTHORN"],
          };
          const active = activeRole === r;
          return (
            <button
              key={r}
              onClick={() => setActiveRole(r)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "7px 0",
                background: active ? "rgba(200,134,26,0.07)" : "transparent",
                color: active ? "#E8DEC4" : "rgba(232,220,196,0.3)",
                letterSpacing: "0.15em",
                fontSize: 11,
                cursor: "pointer",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: active ? "2px solid #C4A84F" : "2px solid transparent",
                fontFamily: "'Oswald', sans-serif",
                transition: "color 0.15s",
              }}
            >
              <span>{labels[r][0]}</span>
              <span style={{ opacity: 0.35, fontSize: 9, letterSpacing: "0.1em" }}>{labels[r][1]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Keyframes ────────────────────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes radar-sweep {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes blip-pulse {
    0%, 100% { opacity: 0.9; }
    50% { opacity: 0.3; }
  }
  @keyframes timer-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
`;

// ─── App ──────────────────────────────────────────────────────────────────────

export default function ColdWarInterface({
  seconds: controlledSeconds,
  modules,
  team,
  initialRole = "analyst",
  onPuzzleComplete,
}: ColdWarInterfaceProps = {}) {
  const [activeRole, setActiveRole] = useState<Role>(initialRole);
  const [localSeconds, setLocalSeconds] = useState(TOTAL_SECONDS);
  const seconds = controlledSeconds ?? localSeconds;

  useEffect(() => {
    if (controlledSeconds !== undefined) return;
    const id = setInterval(() => setLocalSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [controlledSeconds]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0A0A08" }}>
      <style>{KEYFRAMES}</style>
      <SharedHUD seconds={seconds} activeRole={activeRole} setActiveRole={setActiveRole} modules={modules} team={team} />
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {activeRole === "analyst" && <AnalystInterface />}
        {activeRole === "technician" && <TechnicianInterface onPuzzleComplete={() => onPuzzleComplete?.("wire")} />}
        {activeRole === "operator" && <OperatorInterface onPuzzleComplete={() => onPuzzleComplete?.("authorization")} />}
      </div>
      <CommsTerminal role={activeRole} />
    </div>
  );
}
