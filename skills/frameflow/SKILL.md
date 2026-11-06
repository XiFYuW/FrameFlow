---
name: frameflow
description: Turn a topic, brief or script into a rendered short video plus SRT subtitles, a chapter transcript and publish copy, using the FrameFlow Remotion pipeline. Use when asked to create, generate, produce or batch-render a video, short video, reel, explainer, promo, ad, episode or series; when asked to make a vertical or square version, add subtitles or captions, write a transcript, or draft social publish copy from a script; and when asked to scaffold, validate, mount, switch or render a FrameFlow content pack. Also use for requests about video timing, beat grids, scene grids or Ken Burns motion driven by JSON data.
compatibility: Requires Node.js 20+, npm and a Chromium-based browser for full rendering. Works with any agent that can read files and run shell commands; no vendor-specific tools, MCP servers or API keys needed.
metadata:
  version: 1
  kind: model-facing-pipeline
  entrypoint: skills/frameflow/SKILL.md
---

# FrameFlow

FrameFlow is a topic-neutral video pipeline. A **content pack** (plain JSON plus optional media) goes in; an MP4, timed SRT subtitles, a chapter transcript and publish copy come out. The renderer contains no topic, no language and no hardcoded duration.

**Rule zero:** never edit `src/`, `scripts/`, `remotion.config.ts` or `package.json` to make a video. Everything about the video lives in the content pack. If a change seems to require editing the renderer, the content pack is wrong.

## 1. Locate the repository

1. Run `node "<skill-dir>/resolve-root.mjs"`, where `<skill-dir>` is the directory containing this SKILL.md. Its single output line is the absolute repository root; call it REPO. The resolver is self-contained, so it works before REPO is known.
2. Discovery order: `FRAMEFLOW_ROOT` environment variable, walking up from the resolver itself, walking up from the working directory, then the validated `local.json.root` cache hint. Project-level installs therefore keep working after the repository is moved or renamed - no reinstall needed.
3. Use `--json` for `{ ok, root, source, hintStale }` or `--check` for a health check. `hintStale: true` is harmless: the returned root is still correct. Set `FRAMEFLOW_ROOT` to override discovery when several repositories are present.
4. Fallback for older installs without `resolve-root.mjs`: read `local.json` next to this SKILL.md and use `root`; if that directory no longer contains a `package.json` named `frameflow`, ask the user for the current repository path.
5. Run **every** command below from REPO. Use forward slashes in paths and quote paths containing spaces.
6. First-time setup: `node -v` (20+ required), then `npm install`. The `postinstall` hook mounts an English demo pack.

The repository ships no images, fonts or audio. `content/` and `public/` are generated, gitignored runtime directories.

## 2. Pick a workflow

| User intent | Workflow |
|---|---|
| Create a video about a topic, brief or product | **A** - scaffold, author, validate, mount, render, deliver |
| The user already has a content pack directory | **B** - validate, mount, verify |
| Produce several episodes of one series | **C** - multi-episode pack and `switch` |
| Only subtitles, transcript or publish copy | **D** - export without rendering |

## 3. Workflow A - produce a video from a topic

**Step 1 - scaffold a content pack** (outside the repository, never inside `content/`):

```bash
npm run pack:new -- --dir "/abs/path/my-pack" --title "My Video" --seconds 60 --scenes 6
```

Add `--vertical` for 1080x1920 or `--square` for 1080x1080. The script writes `episode.json`, `presets/render.json`, `presets/labels.json` and `pack.json`. Every script line is a `TODO` placeholder that you must replace.

**Step 2 - author `episode.json`.** Read `references/authoring.md` for timing math, line length, highlights and publish copy. Write real spoken lines in the user's language; keep chapter times contiguous. Do not leave any `TODO`.

**Step 3 - validate before touching the renderer:**

```bash
npm run pack:check -- "/abs/path/my-pack"
```

Exit code 0 and `PACK_OK` are mandatory. Add `--json` for machine-readable errors. Fix every `ERROR` and re-run; `warn` lines are advisory.

**Step 4 - mount the pack:**

```bash
npm run content:load -- "/abs/path/my-pack"
```

This writes runtime `content/` and generates neutral placeholder artwork when the pack has no illustrations. For a multi-episode pack add `--episode ep01`.

**Step 5 - verify the composition** (never skip this):

```bash
npm run typecheck
npx remotion compositions src/index.ts
```

Expect one line like `FrameFlow 30 1920x1080 1845 (61.50 sec)`. Confirm fps, canvas and frame count match the brief. If it fails, re-check the pack; do not patch `src/`.

**Step 6 - render.** Smoke-test 60 frames first, then the full film:

```bash
npx remotion render FrameFlow out/preview.mp4 --frames=0-59
npm run render
```

`npm run render` writes `out/frameflow.mp4`. Full rendering can take several minutes; say so rather than retrying.

**Step 7 - deliver all artifacts:**

```bash
npm run deliver -- --name my-video --title "My Video"
```

**Step 8 - report** the master MP4, SRT, transcript, publish `.txt`/`.json`, duration, canvas and pack path. If rendering was skipped, state that explicitly.

## 4. Workflow B - an existing pack

```bash
npm run pack:check -- "/abs/path/pack"
npm run content:load -- "/abs/path/pack"
npm run typecheck && npx remotion compositions src/index.ts
npm run render && npm run deliver -- --name <id> --title "<title>"
```

## 5. Workflow C - a series

Put each episode at `pack/episodes/<id>.json`, set `activeEpisode` in `pack.json`, then per episode:

```bash
npm run switch -- ep02
npx remotion compositions src/index.ts
npm run render
npm run deliver -- --name ep02 --title "Episode title"
```

`switch` only rewrites runtime `content/`; it never edits source files. Render and deliver each episode before switching to the next.

## 6. Workflow D - text artifacts only

```bash
npm run export-sub -- --srt out/video.srt --txt out/video.txt --title "My Video"
npm run publish-copy -- --out out/video-publish.txt
```

Mount a pack first; these commands read the active `content/episode.json`.

## 7. Recovery and common failures

| Symptom | Cause | Fix |
|---|---|---|
| `ROOT_NOT_FOUND` from resolve-root.mjs | Repository moved and cwd is outside it | Set `FRAMEFLOW_ROOT`, or re-run `npm run skill:install -- --target <name> --force` |
| `PACK_INVALID ... scenes end at frame N` | Scene grid shorter than the film | Extend the last `scenes[].end` to `lastEndSec * fps + 45`, or re-scaffold with the right `--seconds` |
| `TODO placeholder` errors | Unedited scaffold | Replace every TODO line in `episode.json` |
| `em ... is not an exact substring` | Highlight phrase not copied from the line | Copy the exact substring from `text` into `em` |
| `segment N.startSec must equal ...` | Gap or overlap in chapters | Make chapter times contiguous and start at 0 |
| `TS2307 ... content/episode.json` | Runtime content missing | `npm run setup` (demo) or `npm run content:load -- <pack>` |
| `compositions` reports wrong fps or size | Wrong `presets/render.json` | Set `width`, `height`, `fps`, `bpm` in the pack |
| Blank or clipped captions | Line too long, or `features.subtitle` off | Shorten lines; set `features.subtitle: true` |
| No audio or custom font | Pack assets are optional | Add `preset.audio` / `preset.font` and place files under `pack/assets/` |
| `[frameflow] Ignoring browser override(s)` | A browser env var points to a missing file | Fix the path, unset it, or set `FRAMEFLOW_BROWSER=bundled`; see `references/commands.md` |

`npm run setup` restores the English demo pack at any time. It deletes the active runtime `content/` and `public/` assets, so warn the user if their pack was mounted from a temporary directory.

## 8. Guardrails

- Never commit or place media inside the repository; packs live outside it.
- Never invent an episode id with spaces or uppercase letters; use `[a-z0-9_-]+`.
- Never claim a video was rendered unless `npm run render` succeeded.
- Never re-render to fix a text or timing problem - fix the pack, re-validate, re-mount, then re-render.
- Prefer `npm run pack:check -- --json` when you need to parse errors programmatically.
- If the user wants a new language, edit `presets/labels.json` and supply a font in the pack; do not translate source comments.

## References (read only what the task needs)

- `resolve-root.mjs` - self-contained repository root discovery; run it before any npm command.
- `references/authoring.md` - turning a topic into a timed script, chapter math, highlights, publish copy, multi-language.
- `references/content-pack.md` - complete pack schema, field constraints, features, transitions, assets.
- `references/commands.md` - full command reference, exit codes, verification checklist, install targets.
