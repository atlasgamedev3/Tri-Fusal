const ROUND_MUSIC_VOLUME = 0.12;
const VICTORY_THEME_VOLUME = 0.34;
const FAILURE_THEME_VOLUME = 0.28;
const PUZZLE_FAIL_VOLUME = 0.22;
const BALANCE_ENGINE_VOLUME = 0.18;

// These are intentionally low enough to feel like a physical bomb tick, not a UI beep.
const BOMB_TICK_FREQUENCIES = Object.freeze({
  low: 360,
  high: 520,
});

// A gentle C-major run: do, re, mi, fa, sol, la, ti, do.
// Starting at C3 keeps the sequence musical without getting shrill by the final note.
const SKILL_CHECK_NOTES = Object.freeze([130.81, 146.83, 164.81, 174.61, 196, 220, 246.94, 261.63]);

// Reflex hits get a smaller two-tone ding so they are rewarding but not distracting.
const REFLEX_DING_FREQUENCIES = Object.freeze([392, 494]);

const ROUND_MUSIC_TRACKS = [
  {
    title: "Closed Casket Funeral",
    artist: "NoLongerNull",
    url: "./client/public/music/rounds/nolongernull/closed-casket-funeral.mp3",
  },
  {
    title: "The Park On The Old Mountain",
    artist: "NoLongerNull",
    url: "./client/public/music/rounds/nolongernull/the-park-on-the-old-mountain.mp3",
  },
  {
    title: "The Walls Are Painted With Blood",
    artist: "NoLongerNull",
    url: "./client/public/music/rounds/nolongernull/the-walls-are-painted-with-blood.mp3",
  },
];

const VICTORY_THEME_URL = "./client/public/music/endings/victory-theme.mp3";
const FAILURE_THEME_URL = "./client/public/sounds/endings/sad-violin.mp3";
const PUZZLE_FAIL_URL = "./client/public/sounds/puzzle/apple-pay-failed.mp3";
const BALANCE_ENGINE_URL = "./client/public/sounds/puzzle/fuel-engines-task-complete.mp3";

class PrototypeAudioController {
  constructor() {
    this.roundMusic = null;
    this.endingAudio = null;
    this.balanceEngineAudio = null;
    this.audioContext = null;
    this.lastTickSecond = null;
    this.selectedRoundTrack = null;
  }

  unlock() {
    const audioContext = this.getAudioContext();
    if (audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }

  startRoundMusic() {
    this.stopEndingAudio();

    if (this.roundMusic && !this.roundMusic.paused) {
      return;
    }

    this.selectedRoundTrack ??= pickRoundMusicTrack();
    this.roundMusic = new Audio(this.selectedRoundTrack.url);
    this.roundMusic.loop = true;
    this.roundMusic.volume = ROUND_MUSIC_VOLUME;
    playWithGestureFallback(this.roundMusic);
  }

  stopRoundMusic() {
    if (!this.roundMusic) return;
    fadeOutAudio(this.roundMusic, 500);
    this.roundMusic = null;
  }

  playVictoryTheme() {
    this.stopRoundMusic();
    this.stopEndingAudio();
    this.stopBalanceEngine();

    this.endingAudio = new Audio(VICTORY_THEME_URL);
    this.endingAudio.loop = false;
    this.endingAudio.volume = VICTORY_THEME_VOLUME;
    playWithGestureFallback(this.endingAudio);
  }

  playFailureTheme() {
    this.stopRoundMusic();
    this.stopEndingAudio();
    this.stopBalanceEngine();

    this.endingAudio = new Audio(FAILURE_THEME_URL);
    this.endingAudio.loop = true;
    this.endingAudio.volume = FAILURE_THEME_VOLUME;
    playWithGestureFallback(this.endingAudio);
  }

  stopEndingAudio() {
    if (!this.endingAudio) return;
    this.endingAudio.pause();
    this.endingAudio.src = "";
    this.endingAudio = null;
  }

  reset() {
    this.stopRoundMusic();
    this.stopEndingAudio();
    this.stopBalanceEngine();
    this.lastTickSecond = null;
    this.selectedRoundTrack = null;
  }

  playBombTick(remainingMs) {
    const currentSecond = Math.ceil(Math.max(0, remainingMs) / 1000);
    if (currentSecond <= 0 || this.lastTickSecond === currentSecond) {
      return;
    }

    this.lastTickSecond = currentSecond;

    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const startTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(
      currentSecond % 2 === 0 ? BOMB_TICK_FREQUENCIES.low : BOMB_TICK_FREQUENCIES.high,
      startTime,
    );

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.1, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.085);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.095);
  }

  playSkillStep(streak) {
    const noteIndex = Math.max(0, Math.min(SKILL_CHECK_NOTES.length - 1, streak - 1));
    this.playTone({
      frequency: SKILL_CHECK_NOTES[noteIndex],
      durationSeconds: 0.16,
      volume: 0.14,
      type: "triangle",
    });
  }

  playReflexDing() {
    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    const startTime = audioContext.currentTime;
    REFLEX_DING_FREQUENCIES.forEach((frequency, index) => {
      this.playTone({
        frequency,
        durationSeconds: 0.11,
        volume: 0.1,
        type: "sine",
        delaySeconds: index * 0.055,
      });
    });
  }

  playPuzzleFail() {
    const failAudio = new Audio(PUZZLE_FAIL_URL);
    failAudio.volume = PUZZLE_FAIL_VOLUME;
    failAudio.currentTime = 0;
    playWithGestureFallback(failAudio);
  }

  startBalanceEngine() {
    if (this.balanceEngineAudio && !this.balanceEngineAudio.paused) {
      return;
    }

    this.balanceEngineAudio ??= new Audio(BALANCE_ENGINE_URL);
    this.balanceEngineAudio.loop = true;
    this.balanceEngineAudio.volume = BALANCE_ENGINE_VOLUME;
    playWithGestureFallback(this.balanceEngineAudio);
  }

  stopBalanceEngine() {
    if (!this.balanceEngineAudio) return;
    this.balanceEngineAudio.pause();
    this.balanceEngineAudio.currentTime = 0;
  }

  playTone({ frequency, durationSeconds, volume, type, delaySeconds = 0 }) {
    const audioContext = this.getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const startTime = audioContext.currentTime + delaySeconds;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + durationSeconds + 0.015);
  }

  getAudioContext() {
    if (this.audioContext) return this.audioContext;

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    this.audioContext = new AudioContextConstructor();
    return this.audioContext;
  }
}

function pickRoundMusicTrack() {
  const index = Math.floor(Math.random() * ROUND_MUSIC_TRACKS.length);
  return ROUND_MUSIC_TRACKS[index];
}

function playWithGestureFallback(audio) {
  audio.play().catch(() => {
    const resume = () => {
      audio.play().catch(() => {});
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };

    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  });
}

function fadeOutAudio(audio, durationMs) {
  const startingVolume = audio.volume;
  const steps = 14;
  const stepMs = durationMs / steps;
  let step = 0;

  const fade = window.setInterval(() => {
    step += 1;
    audio.volume = Math.max(0, startingVolume * (1 - step / steps));

    if (step >= steps || audio.volume <= 0.01) {
      window.clearInterval(fade);
      audio.pause();
      audio.volume = startingVolume;
    }
  }, stepMs);
}

const prototypeAudio = new PrototypeAudioController();

export { prototypeAudio };
