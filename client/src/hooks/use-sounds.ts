import { useRef, useCallback, useState } from "react";

const SOUNDS = ["move", "ping", "activate", "deactivate", "gold", "vote", "clear", "abandon"] as const;
type SoundName = (typeof SOUNDS)[number];
type BombTickPitch = "low" | "high";

export const useSounds = () => {
  const audioRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const volumeRef = useRef(0.25);
  const [sfxVolume, setSfxVolumeState] = useState(0.25);

  if (!audioRef.current) {
    audioRef.current = {
      move: new Audio("/sounds/move.mp3"),
      ping: new Audio("/sounds/ping.mp3"),
      activate: new Audio("/sounds/activate.mp3"),
      deactivate: new Audio("/sounds/deactivate.mp3"),
      gold: new Audio("/sounds/gold.mp3"),
      vote: new Audio("/sounds/vote.mp3"),
      clear: new Audio("/sounds/clear.mp3"),
      abandon: new Audio("/sounds/abandon.mp3"),
    };
    for (const sound of Object.values(audioRef.current)) {
      sound.preload = "auto";
    }
  }

  const play = useCallback((name: SoundName) => {
    const audio = audioRef.current![name];
    audio.volume = volumeRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) return null;

    audioContextRef.current = new AudioContextConstructor();
    return audioContextRef.current;
  }, []);

  const playBombTick = useCallback((pitch: BombTickPitch) => {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const startTime = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(pitch === "high" ? 1180 : 760, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.11, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.07);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.08);
  }, [getAudioContext]);

  const setSfxVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    setSfxVolumeState(volume);
  }, []);

  return { play, playBombTick, sfxVolume, setSfxVolume };
};
