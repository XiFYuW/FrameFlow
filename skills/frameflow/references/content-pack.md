# Content pack schema

A content pack is a plain folder anywhere on disk. The repository never stores media; packs are the only way content enters the pipeline.

```
my-pack/
  pack.json                    optional manifest; activeEpisode for multi-episode packs
  episode.json                 single-episode pack
  episodes/<id>.json           multi-episode pack (used instead of episode.json)
  presets/render.json          required: canvas, clock, scene grid, features
  presets/labels.json          required: output wording templates and file suffixes
  illustrations/<id>/          optional; neutral placeholders are generated when absent
    scene_1.png ... scene_N.png
  assets/                      optional: font and audio files referenced by render.json
```

`current.json` with `{ "episode": "<id>" }` is accepted as a legacy pointer. `pack.json.activeEpisode` takes precedence.

## presets/render.json

| Field | Type | Meaning / constraint |
|---|---|---|
| `width`, `height` | number | Canvas in pixels. Any aspect ratio works (1920x1080, 1080x1920, 1080x1080). |
| `fps` | number | Frames per second; drives the composition registration. |
| `bpm` | number | Beat grid tempo; `BEAT_FRAMES = round(60 / bpm * fps)`. |
| `crossfadeFrames` | number | Transition length at each scene boundary. Must be shorter than the shortest scene. |
| `sceneFilePattern` | string | Must contain `{n}`; replaced with 1..N. Example `frame-{n}.png`. |
| `scenes` | array | Ordered, contiguous frame windows. See below. |
| `transitions` | array | Rotation of transition types at boundaries; repeats if shorter than N-1. |
| `brandTitle` | string | Small top-left brand line. Empty string hides the text. |
| `chapterPrefix`, `chapterSuffix`, `chapterNumerals` | string, string, string[] | Chapter label wording, e.g. `CHAPTER` / `""` / `["ONE", ...]`. |
| `quoteFallback` | string | Source label when `segment.quote.src` is absent. |
| `audio` | object or null | `{ "src": "assets/bgm.wav", "volume": 0.5 }`. `src` is relative to `public/`, so the file is copied from `pack/assets/<src>` or `pack/<src>`. |
| `font` | object or null | `{ "file": "assets/Font.ttf", "family": "Font" }`. Same path rule as audio. |
| `features` | object | Boolean switches for optional visual modules. Missing keys default to off except `subtitle`. |

### Scene objects

```json
{ "index": 1, "start": 0, "end": 300, "z0": 1.0, "z1": 1.08,
  "tx0": 0, "tx1": 20, "ty0": 0, "ty1": -12 }
```

- `start`/`end` are frame numbers. `scenes[0].start` must be 0, `scenes[i].start === scenes[i-1].end`.
- `z0`/`z1` are Ken Burns start/end scale. `tx0`/`tx1`/`ty0`/`ty1` are pixel translations.
- The last `end` must be >= `lastSegment.endSec * fps + 45`, otherwise the tail of the film stretches the final scene.
- `index` is informational; the renderer uses array order.

### Transition types

`fade`, `slideLeft`, `slideRight`, `slideUp`, `slideDown`, `zoom`, `blur`, `wipeDown`, `circleWipe`, `iris`, `shutter`, `flip`. Unknown values are rejected by `npm run pack:check`.

### Feature flags

`subtitle` (default **true**), `particles`, `brandMark`, `chapterLabel`, `chapterSplash`, `quoteCard`, `beatIndicator`, `progressBar`, `seasonMotif`, `watermark`, `taiji`, `sealStamp` (all default **false**).

- `seasonMotif` additionally needs `episode.season` in `spring | summer | autumn | winter`.
- `watermark` needs `episode.seal` (a single character).
- `sealStamp` only draws when a line has a `tag`.
- `quoteCard` only draws when a segment has a `quote`.

### Minimal render.json

```json
{
  "width": 1080,
  "height": 1920,
  "fps": 24,
  "bpm": 120,
  "crossfadeFrames": 16,
  "sceneFilePattern": "scene_{n}.png",
  "scenes": [
    { "start": 0, "end": 180, "z0": 1, "z1": 1.06, "tx0": 0, "tx1": 10, "ty0": 0, "ty1": -8 },
    { "start": 180, "end": 405, "z0": 1, "z1": 1.04, "tx0": 0, "tx1": -10, "ty0": 0, "ty1": 8 }
  ],
  "transitions": ["fade"],
  "brandTitle": "",
  "chapterPrefix": "",
  "chapterSuffix": "",
  "chapterNumerals": [],
  "quoteFallback": "",
  "audio": null,
  "font": null,
  "features": { "subtitle": true, "progressBar": true }
}
```

## presets/labels.json

Every string is a template; `{name}` placeholders are replaced at export time.

| Group | Keys |
|---|---|
| `scriptDoc` | `title` ({title}), `duration` ({duration}, {fps}), `chapter` ({num}, {chapter}, {start}, {end}), `tag` ({tag}), `numerals` (array), `fallbackTitle` |
| `publish.headings` | `titles`, `content`, `hashtags`, `cta`, `copy` |
| `publish.draft` | `titleFirstLine` ({firstLine}, {series}), `titleFromChapter` ({series}, {chapter}), `titleQuestion` ({keyword}), `content` ({firstLine}, {series}, {chapters}, {lastLine}), `cta`, `hashtags`, `chapterSeparator` |
| `publish` | `header` ({title}), `dividerWidth`, `titleWarning` ({limit}, {length}), `maxTitle`, `fallbacks` (`series`, `keyword`, `chapter`, `episodeTitle`) |
| `files` | `subtitles`, `script`, `publishText`, `publishJson`, `preview` - filename suffixes |

`generatePublish` prefers `episode.publish` fields and falls back to these templates. Missing keys cause `npm run pack:check` to fail, because the exporters read them unconditionally.

## Illustrations

- Optional. When `pack/illustrations/<episode.illustrationsDir>/` is absent, `npm run content:load` generates neutral gradient PNGs at the pack's canvas size, named with `sceneFilePattern`.
- When the directory exists, **all** N files must be present; a partial set is a hard error.
- Images are copied into `public/illustrations/<illustrationsDir>/`, which is gitignored. Never put images in the repository.

## episode.json

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `[a-z0-9_-]+`; used as the default delivery name. |
| `title` | yes | Human-readable title. |
| `illustrationsDir` | yes | Single directory name under `illustrations/`. |
| `brandSubtitle` | no | Small line under `brandTitle`. |
| `seal`, `season` | no | Only needed for the watermark and season motif features. |
| `publish` | no | `series`, `episodeTitle`, `titles[]`, `content`, `hashtags[]`, `cta`. Missing fields are auto-drafted. |
| `script.segments` | yes | See `authoring.md`. |

## Common mistakes

- Scaffold with `--seconds 60` but then extend the script to 90 s: the scene grid no longer covers the film. Re-run `pack:check`.
- Set `illustrationsDir` to a nested path: it must be one directory name.
- Reference `audio.src` or `font.file` with an absolute path or `..`: install copies are confined to `public/`.
- Enable decorations without their data (`watermark` without `episode.seal`, `quoteCard` without quotes).
- Mix different `lastEndSec` values in a multi-episode pack: they share one scene grid.
- Leave `features` out entirely: everything except captions will be off, which is valid but visually plain.
