export interface RoundMusicTrack {
  title: string;
  artist: string;
  url: string;
}

export const ROUND_MUSIC_VOLUME = 0.12;
export const VICTORY_THEME_VOLUME = 0.34;
export const FAILURE_THEME_VOLUME = 0.28;

export const ROUND_MUSIC_TRACKS: RoundMusicTrack[] = [
  {
    title: "Closed Casket Funeral",
    artist: "NoLongerNull",
    url: "/music/rounds/nolongernull/closed-casket-funeral.mp3",
  },
  {
    title: "The Park On The Old Mountain",
    artist: "NoLongerNull",
    url: "/music/rounds/nolongernull/the-park-on-the-old-mountain.mp3",
  },
  {
    title: "The Walls Are Painted With Blood",
    artist: "NoLongerNull",
    url: "/music/rounds/nolongernull/the-walls-are-painted-with-blood.mp3",
  },
];

export const VICTORY_THEME_URL = "/music/endings/victory-theme.mp3";
export const FAILURE_THEME_URL = "/sounds/endings/sad-violin.mp3";

export const MUSIC_CREDIT = {
  artist: "NoLongerNull",
  tracks: ROUND_MUSIC_TRACKS.map((track) => track.title),
  note: "Non-commercial prototype. All music rights remain with the original creators; confirm permission before public release.",
};

export function pickRoundMusicTrack() {
  const index = Math.floor(Math.random() * ROUND_MUSIC_TRACKS.length);
  return ROUND_MUSIC_TRACKS[index];
}
