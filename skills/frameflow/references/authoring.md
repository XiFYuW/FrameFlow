# Authoring a script for FrameFlow

The renderer does not understand topics. It only reads `script.segments` and distributes caption time. Your job is to turn a brief into a timeline that is comfortable to read out loud.

## 1. Timeline math

- `fps`, `bpm` come from `presets/render.json`.
- `BEAT_FRAMES = round(60 / bpm * fps)`. Every cue start is snapped to a multiple of `BEAT_FRAMES`, so motion and captions share one clock.
- Inside a chapter, cue durations are proportional to `line.text.length`. The last line absorbs the remainder of the chapter.
- `filmFrames = lastSegment.endSec * fps + 45`. The 45 tail frames let the final caption settle.
- The scene grid in `presets/render.json` must cover `filmFrames`. `npm run pack:new` does this for you.

Consequences:

- Chapters must be contiguous: first `startSec` is `0`, each following `startSec` equals the previous `endSec`.
- A chapter needs at least 2 lines and at least 8 seconds. Very short chapters produce overlapping captions after beat snapping.
- Choose `bpm` so `60 * fps / bpm` is close to a whole number of frames (30 fps with 96 BPM gives 18.75, rounded to 19). Small drift is invisible; large drift makes captions feel late.

## 2. Line length and pacing

| Language | Characters per line | Target on-screen time |
|---|---|---|
| English | 35-70 | 3-6 s |
| Chinese / Japanese / Korean | 12-28 | 3-6 s |

`npm run pack:check` warns above 90 characters. Long lines are split across the beat grid but never reworded, so shorten them yourself. A good chapter is 3-6 lines totalling 15-35 seconds.

Do not write stage directions, markdown, quotes around the line, or speaker names into `text`. Everything in `text` is displayed verbatim as a caption and used as the keyword source for publish copy.

## 3. Field semantics

```json
{
  "chapter": "Why It Matters",
  "startSec": 20,
  "endSec": 48,
  "quote": { "text": "A short pull quote shown in a card.", "src": "Source Name" },
  "lines": [
    { "text": "The first caption of this chapter" },
    { "text": "Highlight the word pipeline in gold", "em": ["pipeline"], "tag": "KEY" },
    { "text": "A closing line that lands before the next chapter" }
  ]
}
```

- `chapter` - shown in the chapter label and the full-screen chapter splash when those features are on.
- `line.text` - the caption. Keep it a complete spoken sentence.
- `line.em` - array of **exact substrings** of `text` to highlight in gold. Also feeds automatic keyword extraction for publish copy. A phrase that is not a substring is a validation error.
- `line.tag` - optional short label. Prefixes the line in the transcript and, with `features.sealStamp`, stamps a seal on screen.
- `segment.quote` - optional pull quote card. `src` falls back to `render.json.quoteFallback`. Only enable `features.quoteCard` if you supply quotes.

`buildCues()` places one cue per line. There is no separate subtitle file to maintain; SRT is generated from this data.

## 4. From brief to chapters

1. State the single takeaway of the video in one sentence.
2. Split it into 3-6 chapters: hook, context, mechanism, evidence, consequence, closing.
3. Allocate seconds proportionally. A 60-second video: 8 / 12 / 14 / 12 / 9 / 5.
4. Write 3-5 spoken lines per chapter, then read them aloud and adjust seconds.
5. Pick one `em` phrase per 2-3 lines; too many highlights look noisy.
6. Fill `publish` with three title candidates, one paragraph of body copy, 5-8 hashtags and a call to action.

## 5. Minimal complete episode.json

```json
{
  "id": "launch-promo",
  "title": "Launch Day",
  "brandSubtitle": "Product Update",
  "illustrationsDir": "launch-promo",
  "publish": {
    "series": "Product Notes",
    "episodeTitle": "Launch Day",
    "titles": ["We shipped something new", "A faster way to start"],
    "content": "A short walkthrough of what changed and why it matters.",
    "hashtags": ["product", "launch", "update"],
    "cta": "Try it today"
  },
  "script": {
    "segments": [
      {
        "chapter": "The Hook",
        "startSec": 0,
        "endSec": 12,
        "lines": [
          { "text": "Something small changed today" },
          { "text": "And it makes the whole flow faster", "em": ["faster"] }
        ]
      },
      {
        "chapter": "What Changed",
        "startSec": 12,
        "endSec": 30,
        "lines": [
          { "text": "We replaced three steps with one" },
          { "text": "The config now drives the entire timeline", "em": ["config"], "tag": "DATA" },
          { "text": "No code changes are needed for a new topic" }
        ]
      }
    ]
  }
}
```

With `fps: 30`, this film is `30 * 30 + 45 = 945` frames (31.5 s). The scene grid must end at frame 945 or later.

## 6. Language, fonts and audio

- All on-screen wording templates live in `presets/labels.json` (transcript header, publish headings, file suffixes). Edit that file to localize outputs.
- For CJK text, supply a font in the pack: set `render.json.font` to `{ "file": "assets/MyFont.ttf", "family": "MyFont" }` and place the file at `pack/assets/MyFont.ttf`. Without it the system font is used and CJK glyphs may be missing in headless Chromium.
- `npm run music` synthesizes a neutral WAV from the pack's bpm and scene duration. Reference it with `render.json.audio = { "src": "assets/bgm.wav", "volume": 0.5 }` and copy the file into `pack/assets/`. The pipeline never supplies audio by itself.

## 7. Multi-episode packs

Use `pack/episodes/ep01.json`, `ep02.json`, and so on instead of `episode.json`. Set `pack.json.activeEpisode` to the default id. All episodes share one `presets/render.json`, so they share canvas, fps, bpm and scene grid; each episode must therefore have the same `lastEndSec`. `npm run switch -- ep02` changes the active episode without touching source files.

## 8. Pre-flight checklist

- [ ] No `TODO` left in `episode.json` or `publish`.
- [ ] First `startSec` is 0; chapter boundaries are contiguous.
- [ ] `lastEndSec * fps + 45` is covered by the last scene's `end`.
- [ ] Every `em` phrase is an exact substring of its line.
- [ ] Lines are short enough to read aloud in their allocated time.
- [ ] `npm run pack:check -- <packDir>` exits 0.
- [ ] `publish` has titles, content, hashtags and cta (otherwise they are auto-drafted).
