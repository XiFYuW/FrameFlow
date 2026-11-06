import episodeData from "../content/episode.json";
import renderPresetData from "../content/presets/render.json";

// Content is mounted at runtime by scripts/init-content.mjs.
// content/ is gitignored; the tracked English example lives in examples/demo.
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface SceneSpec {
  start: number;
  end: number;
  z0: number;
  z1: number;
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

export interface RenderPreset {
  width: number;
  height: number;
  fps: number;
  bpm: number;
  crossfadeFrames: number;
  sceneFilePattern: string;
  scenes: SceneSpec[];
  transitions: string[];
  brandTitle: string;
  chapterPrefix: string;
  chapterSuffix: string;
  chapterNumerals: string[];
  quoteFallback: string;
  audio: { src: string; volume: number } | null;
  font: { file: string; family: string } | null;
  features: Record<string, boolean>;
}

const DEFAULTS: RenderPreset = {
  width: 1920,
  height: 1080,
  fps: 30,
  bpm: 96,
  crossfadeFrames: 32,
  sceneFilePattern: "scene_{n}.png",
  scenes: [],
  transitions: ["fade"],
  brandTitle: "",
  chapterPrefix: "CHAPTER",
  chapterSuffix: "",
  chapterNumerals: [],
  quoteFallback: "SOURCE",
  audio: null,
  font: null,
  features: {},
};

const FEATURE_DEFAULTS = {
  seasonMotif: false,
  watermark: false,
  taiji: false,
  brandMark: false,
  chapterLabel: false,
  chapterSplash: false,
  sealStamp: false,
  quoteCard: false,
  particles: false,
  beatIndicator: false,
  progressBar: false,
  subtitle: true,
};

const raw = renderPresetData as unknown as Partial<RenderPreset>;

export const renderPreset: RenderPreset = { ...DEFAULTS, ...raw } as RenderPreset;
export const FEATURES = { ...FEATURE_DEFAULTS, ...(raw.features ?? {}) };
export const AUDIO = renderPreset.audio;

interface Episode {
  id: string;
  title: string;
  brandSubtitle?: string;
  illustrationsDir: string;
  seal?: string;
  season?: Season;
  publish?: Record<string, unknown>;
  script: {
    segments: Array<{
      chapter: string;
      startSec: number;
      endSec: number;
      quote?: { text: string; src?: string };
      lines: Array<{ text: string; tag?: string; em?: string[] }>;
    }>;
  };
}

export const episode = episodeData as unknown as Episode;
