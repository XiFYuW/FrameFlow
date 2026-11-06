import { episode, renderPreset } from "./episode";

// Canvas, clock and beat grid all come from the content pack.
export const FPS = renderPreset.fps || 30;
export const WIDTH = renderPreset.width || 1920;
export const HEIGHT = renderPreset.height || 1080;

export const BPM = renderPreset.bpm || 96;
export const BEAT_FRAMES = Math.max(1, Math.round((60 / BPM) * FPS));

export interface Line {
  text: string;
  tag?: string;
  em?: string[];
}

export interface Quote {
  text: string;
  src?: string;
}

export interface Segment {
  chapter: string;
  startSec: number;
  endSec: number;
  quote?: Quote;
  lines: Line[];
}

export interface Cue {
  chapter: string;
  chapterIndex: number;
  text: string;
  tag?: string;
  em?: string[];
  start: number;
  end: number;
}

// Script content is mounted at runtime from content/episode.json.
export const segments = episode.script.segments as Segment[];

/**
 * Distribute each segment's lines over its time span, proportional to text
 * length, then snap every cue start to the nearest beat boundary.
 */
function buildCues(segs: Segment[]): Cue[] {
  const cues: Cue[] = [];
  segs.forEach((seg, i) => {
    const startFrame = Math.round(seg.startSec * FPS);
    const endFrame = Math.round(seg.endSec * FPS);
    const dur = endFrame - startFrame;
    const totalChars = seg.lines.reduce((s, l) => s + l.text.length, 0) || 1;

    let acc = 0;
    const rawStarts: number[] = [];
    seg.lines.forEach((line, j) => {
      const isLast = j === seg.lines.length - 1;
      const frac = line.text.length / totalChars;
      const lineDur = isLast
        ? endFrame - (startFrame + acc)
        : Math.max(Math.round(frac * dur), 12);
      rawStarts.push(startFrame + acc);
      acc += lineDur;
    });

    const snapped = rawStarts.map((s) =>
      Math.max(startFrame, Math.min(Math.round(s / BEAT_FRAMES) * BEAT_FRAMES, endFrame))
    );
    for (let j = 1; j < snapped.length; j++) {
      if (snapped[j] <= snapped[j - 1]) {
        snapped[j] = Math.min(snapped[j - 1] + BEAT_FRAMES, endFrame);
      }
    }

    seg.lines.forEach((line, j) => {
      const cStart = snapped[j];
      const cEnd = j < seg.lines.length - 1 ? snapped[j + 1] : endFrame;
      cues.push({
        chapter: seg.chapter,
        chapterIndex: i + 1,
        text: line.text,
        tag: line.tag,
        em: line.em,
        start: cStart,
        end: cEnd,
      });
    });
  });
  return cues;
}

export const cues: Cue[] = buildCues(segments);

export const totalDurationInFrames = cues[cues.length - 1].end;

export function formatTimecode(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
