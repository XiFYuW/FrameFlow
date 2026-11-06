# FrameFlow

> **Language:** English (default) - [Chinese (Simplified)](./README.zh-CN.md)

A topic-neutral short-video pipeline designed to be **driven by AI agents**. It is distributed as an Agent Skill, not as a video project: the repository contains only code and JSON, with no images, fonts, audio or finished videos.

A content pack (script + optional media) goes in. An MP4, SRT subtitles, a chapter transcript and publish copy come out. The renderer has no built-in topic, language, duration or aspect ratio.

## Quick start

```bash
npm install
npm run skill:install -- --list
```

Installation is optional. Agents that can read files and run shell commands need no setup at all: point them at `skills/frameflow/SKILL.md` and give them the repository path.

To register the skill with an agent that scans a skills directory, use `npm run skill:install -- --dir <path>` (any directory works), or pick a shortcut name from `npm run skill:install -- --list`. Add `--force` to refresh an existing copy.

Then ask any model something like:

- "Make a 60-second vertical promo about our new feature, with subtitles and publish copy."
- "Create a 6-episode series from this outline and render episode 1."
- "Validate my content pack at /abs/path/pack and mount it."
- "Export subtitles and a transcript for the active episode."

## How the skill works

```
brief / topic
   -> npm run pack:new        scaffold a content pack outside the repo
   -> agent authors episode.json (chapters, captions, highlights, publish copy)
   -> npm run pack:check      deterministic validation, JSON output available
   -> npm run content:load    mount pack, generate neutral artwork if needed
   -> typecheck + compositions
   -> npm run render          master MP4
   -> npm run deliver         mp4 + srt + transcript + publish txt/json
```

The engine is never edited for a new topic. See `skills/frameflow/SKILL.md` for the full workflow and `skills/frameflow/references/` for the authoring guide, pack schema and command reference.

## Content pack contract

```
my-pack/
  episode.json                 or episodes/<id>.json for a series
  presets/render.json          canvas, fps, bpm, scene grid, feature flags
  presets/labels.json          output wording and file suffixes
  illustrations/<id>/          optional; placeholders generated when absent
  assets/                      optional font / audio
```

`examples/demo/` is a complete, media-free English pack. Copy it or scaffold a new one with `npm run pack:new`.

## Commands

| Command | Purpose |
|---|---|
| `npm run pack:new -- --dir <dir> --title "<title>"` | Scaffold a content pack |
| `npm run pack:check -- <dir> [--json]` | Validate a pack before mounting |
| `npm run content:load -- <dir> [--episode <id>]` | Mount a pack into runtime `content/` |
| `npm run switch -- <id>` | Switch episode in a multi-episode pack |
| `npm run setup` | Restore the English demo pack |
| `npm run typecheck` | TypeScript check |
| `npx remotion compositions src/index.ts` | Verify registered composition |
| `npm run render` | Render `out/frameflow.mp4` |
| `npm run deliver -- --name <id> --title "<title>"` | Package all deliverables |
| `npm run export-sub` / `npm run publish-copy` | Text artifacts only |
| `npm run skill:install -- --dir <path>` | Install the skill into any skills directory |
| `npm run skill:install -- --list` | Show optional shortcut target names |

## Repository layout

```
README.md, README.zh-CN.md   English / Chinese documentation
AGENTS.md                    fallback pointer for AGENTS-aware models
skills/frameflow/            SKILL.md + references/ + resolve-root.mjs (portable Agent Skills)
scripts/                     pack scaffolding, validation, mounting, export, skill install
src/                         Remotion renderer (topic-neutral)
examples/demo/               tracked English reference content pack
content/, public/, out/      gitignored runtime artifacts
```

## Supported agents

The skill uses only the portable Agent Skills frontmatter fields (`name`, `description`, `compatibility`, `metadata`), so it loads in Claude Code, WorkBuddy, claude.ai / Skills API uploads, and any agent that reads `SKILL.md`. `AGENTS.md` at the repository root is a fallback pointer for agents that read that convention instead. No vendor integration, API key or vendor-specific setup is involved: the install target names are merely shortcuts for a few common skills directories, and `--dir <path>` works for everything else.

Each installed copy ships `resolve-root.mjs`, which discovers the repository at runtime. `local.json.root` is only a validated cache hint, so renaming or moving the folder does **not** require reinstalling project-level skills. Set `FRAMEFLOW_ROOT` to override discovery when several checkouts exist.

Requirements: Node.js 20+ and npm. Full MP4 rendering needs a Chromium-based browser; if none is installed, Remotion downloads its own Chrome Headless Shell.

`remotion.config.ts` finds a browser on Windows, macOS and Linux (standard install locations, then `PATH`). Override it with `REMOTION_BROWSER`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH` or `CHROME_BIN`. Set `FRAMEFLOW_BROWSER=bundled` to always use Remotion's own browser, `FRAMEFLOW_BROWSER_DEBUG=1` to print which one was selected, or `FRAMEFLOW_CONCURRENCY=<n>` to tune render concurrency on smaller CI runners. These are optional environment variables: no config edit and no per-platform setup is needed.

## Verifying the engine

```bash
npm install
npm run pack:check -- examples/demo
npm run content:load -- examples/demo
npm run typecheck
npx remotion compositions src/index.ts
```

Expected: `PACK_OK`, typecheck exit 0, and a single `FrameFlow` composition whose fps, canvas and frame count come from `examples/demo/presets/render.json`.

## Documentation languages

- `README.md` (this file) is the canonical English documentation.
- [`README.zh-CN.md`](./README.zh-CN.md) is the Simplified Chinese translation, with the same section order.
- If the two ever disagree, the English file wins.
- All code, `SKILL.md`, skill references, scripts and the example content pack stay English. The Chinese README is the only file in the repository that contains Chinese text; it is documentation for humans, never an input to the renderer or the skill.

---

[Chinese (Simplified)](./README.zh-CN.md)
