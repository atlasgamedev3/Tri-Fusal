// Central audio controller for Tri-Fusal.
// Other game files should import this module instead of creating their own Audio objects.
// That keeps sound effects, music, volume, muting, and queued playback in one place.

// Volume values always use a 0-1 range, where 0 is silent and 1 is full volume.
const DEFAULT_VOLUME = 1;

// Default time used when one song fades out before another starts.
const DEFAULT_FADE_MS = 400;

// Audio entries are separated by type so music and sound effects can have separate volume sliders.
const SOUND_TYPES = Object.freeze({
  MUSIC: "music",
  SFX: "sfx",
});

// Placeholder sound effect names the rest of the game can call before final files are chosen.
const SOUND_KEYS = Object.freeze({
  BUTTON_PRESS: "buttonPress",
  MODULE_SOLVED: "moduleSolved",
  MODULE_FAILED: "moduleFailed",
  TIMER_TICK: "timerTick",
  WARNING: "warning",
  DEFUSE_SUCCESS: "defuseSuccess",
  DETONATION: "detonation",
});

// Placeholder song names the rest of the game can call before final music files are chosen.
const MUSIC_KEYS = Object.freeze({
  MENU: "menuTheme",
  ROUND: "roundTension",
  VICTORY: "victoryTheme",
  DEFEAT: "defeatTheme",
});

class SoundManager {
  constructor() {
    // Stores every registered audio file by its key, such as "buttonPress".
    this.registry = new Map();

    // Holds play requests that should happen later, usually after browser audio is unlocked.
    this.queue = [];

    // Tracks cloned sound effect instances so volume changes can affect sounds already playing.
    this.activeInstances = new Set();

    // Remembers the currently playing song so only one music track plays at a time.
    this.activeMusic = null;

    // Volume controls multiply together: master * music/sfx * individual sound volume.
    this.masterVolume = DEFAULT_VOLUME;
    this.musicVolume = DEFAULT_VOLUME;
    this.sfxVolume = DEFAULT_VOLUME;

    // Muting sets computed volume to 0 without losing the user's volume settings.
    this.isMuted = false;

    // Browsers usually block audio until the first user gesture; unlock() flips this on.
    this.isUnlocked = false;
  }

  /**
   * Registers a short sound effect, like a button click, warning beep, or success chime.
   *
   * Example:
   * soundManager.registerSound(SOUND_KEYS.BUTTON_PRESS, "/assets/audio/button-press.wav");
   */
  registerSound(key, source, options = {}) {
    return this.register(key, source, {
      ...options,
      type: SOUND_TYPES.SFX,
      loop: options.loop ?? false,
    });
  }

  /**
   * Registers a song or looping ambience track.
   * Music loops by default because most game songs should continue until replaced or stopped.
   */
  registerMusic(key, source, options = {}) {
    return this.register(key, source, {
      ...options,
      type: SOUND_TYPES.MUSIC,
      loop: options.loop ?? true,
    });
  }

  /**
   * Internal registration method shared by registerSound() and registerMusic().
   * It creates the browser Audio object, applies defaults, stores it, and tries any queued plays.
   */
  register(key, source, options = {}) {
    if (!key || !source) {
      throw new Error("SoundManager.register requires both a key and source.");
    }

    const audio = this.createAudio(source);
    const entry = {
      key,
      source,
      audio,
      type: options.type ?? SOUND_TYPES.SFX,
      loop: options.loop ?? false,
      volume: options.volume ?? DEFAULT_VOLUME,
    };

    audio.loop = entry.loop;
    audio.preload = options.preload ?? "auto";
    audio.volume = this.getComputedVolume(entry);

    this.registry.set(key, entry);
    this.flushQueue();

    return entry;
  }

  /**
   * Registers a group of audio assets at once.
   * This is useful later when the game has one audio manifest file.
   */
  registerBank(bank = {}) {
    for (const [key, config] of Object.entries(bank.sounds ?? {})) {
      const soundConfig = normalizeAssetConfig(config);
      this.registerSound(key, soundConfig.source, soundConfig.options);
    }

    for (const [key, config] of Object.entries(bank.music ?? {})) {
      const musicConfig = normalizeAssetConfig(config);
      this.registerMusic(key, musicConfig.source, musicConfig.options);
    }
  }

  /**
   * Queues a sound effect by name.
   * Use this from game logic when a sound should happen, even if audio is not unlocked yet.
   */
  queueSoundEffect(key, options = {}) {
    return this.enqueue({
      action: "play",
      key,
      type: SOUND_TYPES.SFX,
      options,
    });
  }

  /**
   * Queues a song by name.
   * By default, a newly queued song replaces older queued songs so stale music does not play later.
   */
  queueSong(key, options = {}) {
    return this.enqueue({
      action: "play",
      key,
      type: SOUND_TYPES.MUSIC,
      options,
    });
  }

  /**
   * Plays a sound effect immediately if the browser allows it.
   * If audio is still locked, the request is queued instead.
   */
  playSoundEffect(key, options = {}) {
    return this.play(key, {
      ...options,
      type: SOUND_TYPES.SFX,
    });
  }

  /**
   * Plays a song immediately if the browser allows it.
   * Starting a new song stops the current song so tracks do not overlap.
   */
  playSong(key, options = {}) {
    return this.play(key, {
      ...options,
      type: SOUND_TYPES.MUSIC,
    });
  }

  /**
   * Stops the current song, optionally fading it out first.
   */
  stopSong(options = {}) {
    if (!this.activeMusic) {
      return;
    }

    this.stopAudio(this.activeMusic.audio, options);
    this.activeMusic = null;
  }

  /**
   * Stops every registered song, base audio file, and currently playing sound effect clone.
   */
  stopAll(options = {}) {
    for (const entry of this.registry.values()) {
      this.stopAudio(entry.audio, options);
    }

    for (const instance of this.activeInstances) {
      this.stopAudio(instance.audio, options);
    }

    this.activeMusic = null;
    this.activeInstances.clear();
    this.queue = [];
  }

  /**
   * Clears delayed play requests without stopping sounds that are already playing.
   */
  clearQueue() {
    this.queue = [];
  }

  /**
   * Sets the overall game volume.
   */
  setMasterVolume(volume) {
    this.masterVolume = clampVolume(volume);
    this.syncVolumes();
  }

  /**
   * Sets the music-only volume.
   */
  setMusicVolume(volume) {
    this.musicVolume = clampVolume(volume);
    this.syncVolumes();
  }

  /**
   * Sets the sound-effect-only volume.
   */
  setSfxVolume(volume) {
    this.sfxVolume = clampVolume(volume);
    this.syncVolumes();
  }

  /**
   * Silences all audio without changing saved volume levels.
   */
  mute() {
    this.isMuted = true;
    this.syncVolumes();
  }

  /**
   * Restores audio after mute().
   */
  unmute() {
    this.isMuted = false;
    this.syncVolumes();
  }

  /**
   * Flips mute on or off and returns the new muted state.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    this.syncVolumes();
    return this.isMuted;
  }

  /**
   * Allows queued audio to play after a user gesture, such as clicking Start.
   */
  unlock() {
    this.isUnlocked = true;
    this.flushQueue();
  }

  /**
   * Adds a play request to the queue and tries to flush it immediately if audio is ready.
   */
  enqueue(item) {
    if (!item.key) {
      return null;
    }

    const queuedItem = {
      ...item,
      id: createQueueId(),
      options: item.options ?? {},
    };

    // Keep only the latest queued music request unless a caller explicitly wants the old ones.
    if (item.type === SOUND_TYPES.MUSIC && queuedItem.options.replaceQueuedMusic !== false) {
      this.queue = this.queue.filter((queued) => queued.type !== SOUND_TYPES.MUSIC);
    }

    this.queue.push(queuedItem);
    this.flushQueue();

    return queuedItem.id;
  }

  /**
   * Plays everything currently queued if audio is unlocked and each key is registered.
   */
  flushQueue() {
    if (!this.isUnlocked) {
      return;
    }

    const stillQueued = [];

    for (const item of this.queue) {
      // Leave unknown keys queued so they can play later if the asset is registered afterward.
      if (!this.registry.has(item.key)) {
        stillQueued.push(item);
        continue;
      }

      void this.play(item.key, {
        ...item.options,
        type: item.type,
        queueWhenLocked: false,
        warnIfMissing: false,
      });
    }

    this.queue = stillQueued;
  }

  /**
   * Shared play method used by both sound effects and songs.
   */
  async play(key, options = {}) {
    const entry = this.registry.get(key);

    if (!entry) {
      if (options.warnIfMissing !== false) {
        this.warnMissingSound(key);
      }

      return null;
    }

    // Browser autoplay rules can block sound before the player clicks or presses a key.
    if (!this.isUnlocked && options.queueWhenLocked !== false) {
      this.enqueue({
        action: "play",
        key,
        type: options.type ?? entry.type,
        options,
      });
      return null;
    }

    const isMusic = entry.type === SOUND_TYPES.MUSIC || options.type === SOUND_TYPES.MUSIC;

    if (isMusic) {
      this.stopCurrentMusic(entry, options);
    }

    const playback = this.prepareAudio(entry, options);

    if (isMusic) {
      this.activeMusic = { entry, audio: playback.audio };
    }

    try {
      await playback.audio.play();

      if (playback.shouldTrack) {
        this.trackInstance(playback.audio, entry, options.volume);
      }

      return playback.audio;
    } catch (error) {
      console.warn("[SoundManager] Could not play \"" + key + "\".", error);
      return null;
    }
  }

  /**
   * Stops the currently active song before the next song starts.
   */
  stopCurrentMusic(nextEntry, options = {}) {
    if (!this.activeMusic) {
      return;
    }

    const fadeMs = this.activeMusic.entry === nextEntry ? 0 : options.crossfadeMs ?? DEFAULT_FADE_MS;
    this.stopSong({ fadeMs });
  }

  /**
   * Prepares an Audio object for playback.
   * Sound effects are cloned so the same effect can overlap itself when triggered quickly.
   */
  prepareAudio(entry, options = {}) {
    const shouldClone = entry.type === SOUND_TYPES.SFX || options.overlap === true;
    const audio = shouldClone ? entry.audio.cloneNode(true) : entry.audio;

    audio.loop = options.loop ?? entry.loop;
    audio.volume = this.getComputedVolume(entry, options.volume);

    if (shouldClone || options.fromStart) {
      audio.currentTime = 0;
    }

    return { audio, shouldTrack: shouldClone };
  }

  /**
   * Tracks a cloned sound effect only while it is active.
   */
  trackInstance(audio, entry, volumeOverride) {
    const instance = { audio, entry, volumeOverride };
    const cleanup = () => this.activeInstances.delete(instance);

    this.activeInstances.add(instance);
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("pause", cleanup, { once: true });
  }

  /**
   * Stops one Audio object immediately or fades it out first.
   */
  stopAudio(audio, options = {}) {
    if (!audio) {
      return;
    }

    const fadeMs = options.fadeMs ?? 0;

    if (fadeMs > 0 && audio.volume > 0) {
      this.fadeOut(audio, fadeMs);
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }

  /**
   * Gradually lowers an Audio object's volume, then pauses and rewinds it.
   */
  fadeOut(audio, durationMs) {
    const startingVolume = audio.volume;
    const startedAt = getTime();

    const step = (currentTime) => {
      const progress = Math.min((currentTime - startedAt) / durationMs, 1);
      audio.volume = startingVolume * (1 - progress);

      if (progress < 1) {
        nextFrame(step);
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      audio.volume = startingVolume;
    };

    nextFrame(step);
  }

  /**
   * Recalculates volume for registered audio and active cloned sound effects.
   */
  syncVolumes() {
    for (const entry of this.registry.values()) {
      entry.audio.volume = this.getComputedVolume(entry);
    }

    for (const instance of this.activeInstances) {
      instance.audio.volume = this.getComputedVolume(instance.entry, instance.volumeOverride);
    }
  }

  /**
   * Combines master, type-specific, and per-sound volume into the final browser volume.
   */
  getComputedVolume(entry, overrideVolume) {
    if (this.isMuted) {
      return 0;
    }

    const typeVolume = entry.type === SOUND_TYPES.MUSIC ? this.musicVolume : this.sfxVolume;
    return clampVolume(this.masterVolume * typeVolume * (overrideVolume ?? entry.volume));
  }

  /**
   * Creates a browser Audio object.
   * Keeping this wrapped makes the browser-only requirement obvious and easy to test later.
   */
  createAudio(source) {
    if (typeof Audio === "undefined") {
      throw new Error("SoundManager requires a browser environment with HTMLAudioElement support.");
    }

    return new Audio(source);
  }

  /**
   * Warns developers when game code tries to play a key that has not been wired to a file yet.
   */
  warnMissingSound(key) {
    console.warn("[SoundManager] \"" + key + "\" has not been registered yet.");
  }
}

/**
 * Converts registerBank() entries into one consistent shape.
 * Accepts either "path/to/file.mp3" or { source, options }.
 */
function normalizeAssetConfig(config) {
  if (typeof config === "string") {
    return { source: config, options: {} };
  }

  return {
    source: config?.source,
    options: config?.options ?? {},
  };
}

/**
 * Keeps any volume number inside the browser's allowed 0-1 audio range.
 */
function clampVolume(volume) {
  if (Number.isNaN(Number(volume))) {
    return DEFAULT_VOLUME;
  }

  return Math.max(0, Math.min(1, Number(volume)));
}

/**
 * Gives queued items a simple identifier in case the UI wants to reference them later.
 */
function createQueueId() {
  return Math.random().toString(36).slice(2);
}

/**
 * Uses high-resolution browser timing when available, with Date.now() as a fallback.
 */
function getTime() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Runs animation steps in the browser and falls back to a short timer outside the browser.
 */
function nextFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(callback);
    return;
  }

  setTimeout(() => callback(getTime()), 16);
}

// Export one shared manager so every game file talks to the same audio state.
const soundManager = new SoundManager();

export { MUSIC_KEYS, SOUND_KEYS, SOUND_TYPES, SoundManager, soundManager };
export default soundManager;
