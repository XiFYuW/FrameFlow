# Command reference

Run all commands from the repository root (the directory containing `package.json`). Paths use forward slashes. Node.js 20+ and npm are required; full MP4 rendering also needs a Chromium-based browser, which Remotion downloads automatically if none is installed.

## Setup and installation

| Command | Effect |
|---|---|
| `node -v` | Verify Node 20+. |
| `npm install` | Install dependencies; `postinstall` mounts the English demo pack into `content/`. |
| `node <skill-dir>/resolve-root.mjs` | Print the current absolute repository root. |
| `node <skill-dir>/resolve-root.mjs --json` | Same, as JSON: `{ ok, root, source, hintStale }`. |
| `node <skill-dir>/resolve-root.mjs --check` | Health check: `ROOT_OK <root> (via <source>)`. |
| `npm run skill:install -- --list` | Show skill install targets. |
| `npm run skill:install -- --dir /abs/skills/frameflow` | Install into any agent's skills directory (vendor-neutral). |
| `npm run skill:install -- --target <name>` | Install into one of the shortcut directories listed by `--list`. |
| `npm run skill:install -- --target <name> --force` | Refresh an existing installation. |
| `npm run skill:install -- --check` | Validate SKILL.md frontmatter against the portable Agent Skills spec. |

Optional shortcut targets: `workbuddy-project` (`REPO/.workbuddy/skills/frameflow`), `workbuddy-user` (`~/.workbuddy/skills/frameflow`), `claude-project` (`REPO/.claude/skills/frameflow`), `claude-user` (`~/.claude/skills/frameflow`). These are only conveniences for common directory conventions, not a dependency; `--dir <path>` works for any agent. An installed copy contains `SKILL.md`, `references/`, `resolve-root.mjs` and `local.json`.

Any agent that can read files and run shell commands can also use the skill without installation: point it at `REPO/skills/frameflow/SKILL.md` and tell it the repository path.

## Repository discovery

`local.json.root` is a **cache hint**, not the source of truth. `resolve-root.mjs` sits next to SKILL.md in every installed copy and resolves REPO in this order:

1. `FRAMEFLOW_ROOT` environment variable (explicit override, useful with several checkouts).
2. Walking up from the resolver's own directory. Project-level installs live inside REPO, so they follow the repository automatically.
3. Walking up from the current working directory.
4. `local.json.root`, only if it still points at a directory with `package.json` named `frameflow` and `skills/frameflow/SKILL.md`.

A directory is accepted only when both markers match. A stale hint is reported as `hintStale: true` but never breaks discovery. **Moving or renaming the repository does not require reinstalling project-level skills.** Only a user-level install whose cached root is stale and whose cwd is outside the repository needs `npm run skill:install -- --target <name> --force` (or `FRAMEFLOW_ROOT`).

## Browser discovery

`remotion.config.ts` is platform-neutral. It resolves a Chromium-based browser in this order:

1. Explicit path overrides: `REMOTION_BROWSER`, `FRAMEFLOW_BROWSER` (when set to a path), `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_BIN`.
2. Standard install locations for the host OS: Windows (`Program Files`, `Program Files (x86)`, `%LOCALAPPDATA%` for Chrome / Edge / Chromium / Brave), macOS (`/Applications/*.app/Contents/MacOS/*`, `~/Applications`, Homebrew), Linux/BSD (`/opt/google/chrome/chrome`, `/usr/bin/*`, `/snap/bin/chromium`, and friends).
3. `PATH` lookup for `google-chrome-stable`, `google-chrome`, `chromium`, `microsoft-edge` and other common binary names.
4. If nothing is found, **no browser is configured** and Remotion downloads its own Chrome Headless Shell. This works on headless CI with no system browser installed.

On POSIX the executable bit is checked; Windows uses the `.exe` file check instead. An override pointing at a missing file is ignored with a `[frameflow] Ignoring browser override(s)` warning rather than failing the render.

| Variable | Effect |
|---|---|
| `FRAMEFLOW_BROWSER=bundled` | Skip system browsers; always use Remotion's downloaded browser |
| `FRAMEFLOW_BROWSER_DEBUG=1` | Print the selected browser and its discovery source |
| `FRAMEFLOW_CONCURRENCY=<n>` | Override render concurrency (default 4), useful in containers |

Do not edit `remotion.config.ts` per platform. Use these variables instead; see `references/content-pack.md` if a render fails for reasons unrelated to the browser.

## Content packs

| Command | Effect | Exit code |
|---|---|---|
| `npm run pack:new -- --dir <dir> --title "<title>" [options]` | Scaffold a pack. Options: `--id`, `--series`, `--seconds`, `--scenes`, `--vertical`, `--square`, `--fps`, `--bpm`, `--force`. | 1 on invalid arguments or existing directory |
| `npm run pack:check -- <dir>` | Validate the pack; prints `PACK_OK` or `PACK_INVALID` with numbered errors. | 0 valid, 1 invalid |
| `npm run pack:check -- <dir> --json` | Same, as JSON: `{ ok, errors[], warnings[], summary }`. | 0 valid, 1 invalid |
| `npm run content:load -- <dir>` | Mount a pack: write `content/`, copy or generate artwork, copy optional assets. | 1 on failure |
| `npm run content:load -- <dir> --episode ep02` | Mount a specific episode of a multi-episode pack. | 1 on failure |
| `npm run switch -- ep02` | Switch active episode inside the mounted pack. | 1 if the pack has a single episode |
| `npm run setup` | Restore the English demo pack (replaces runtime `content/` and `public/`). | 1 on failure |

`node scripts/init-content.mjs --if-missing` is used by `postinstall`; it never overwrites an existing mounted pack.

## Verification (always before rendering)

| Command | Expected |
|---|---|
| `npm run typecheck` | exit 0, no output |
| `npx remotion compositions src/index.ts` | One line: `FrameFlow <fps> <width>x<height> <frames> (<seconds> sec)` |

The composition id is always `FrameFlow`. Duration is derived from the script, not hardcoded.

## Rendering and delivery

| Command | Output |
|---|---|
| `npx remotion render FrameFlow out/preview.mp4 --frames=0-59` | 60-frame smoke test |
| `npm run render` | `out/frameflow.mp4` (full master) |
| `npm run deliver -- --name <id> --title "<title>"` | Renames the master, writes `<id>-subtitles.srt`, `<id>-script.txt`, `<id>-publish.txt`, `<id>-publish.json` into `out/` |
| `npm run export-sub -- --srt out/x.srt --txt out/x.txt --title "..."` | SRT and transcript only |
| `npm run publish-copy -- --out out/x-publish.txt` | Publish copy only |
| `npm run music` | Synthesizes `public/bgm.wav` from the mounted bpm and scene duration (reference it from the pack to use it) |
| `npm start` | Remotion Studio for visual inspection |

`deliver` expects the master at `out/frameflow.mp4` by default; pass `--render <path>` if you rendered elsewhere. If the render file is absent it still writes the text artifacts and prints a warning.

## Delivery checklist

- [ ] `npm run pack:check -- <dir>` returned `PACK_OK`.
- [ ] `npm run typecheck` exited 0.
- [ ] `compositions` fps, canvas and frame count match the brief.
- [ ] `out/<id>.mp4` exists and has a non-trivial size.
- [ ] `<id>-subtitles.srt` last timecode is close to the film duration.
- [ ] `<id>-script.txt` chapter order matches the script.
- [ ] Publish `.txt` and `.json` contain the real titles, body, hashtags and cta.
- [ ] Report the content pack path to the user so the video can be reproduced.

## Troubleshooting

| Output | Meaning | Action |
|---|---|---|
| `ROOT_NOT_FOUND` | No valid repository found in the discovery chain | Set `FRAMEFLOW_ROOT`, or re-run the install with `--force` |
| `hintStale: true` | Cached `local.json.root` is stale, but a valid root was found elsewhere | Harmless; refresh the install only to tidy the cache |
| `TS2307 Cannot find module '../content/episode.json'` | Runtime content missing | `npm run setup` or `npm run content:load -- <dir>` |
| `Content install failed: Missing presets/render.json` | Pack is incomplete | Re-run `pack:new`, or copy both presets from `examples/demo/presets/` |
| `Missing illustrations in ...` | Partial artwork directory | Add the missing files, or remove the directory to get generated placeholders |
| `Optional asset not found, skipping` | `audio.src` / `font.file` points to a missing file | Put it under `pack/assets/` with the exact relative path |
| `Scene preload failed, continuing render` | Browser could not load an image | Check `illustrationsDir` and `sceneFilePattern` |
| `Composition ... not found` | Wrong composition id | Use `FrameFlow` exactly |
| `compositions` hangs on first run | Remotion downloading Chrome Headless Shell | Wait; do not kill and retry immediately |
| `[frameflow] Ignoring browser override(s)` | A browser env var points to a missing file | Fix the path, unset it, or set `FRAMEFLOW_BROWSER=bundled` |
| `pack:check` reports `TODO placeholder` | Scaffold was not authored | Replace TODO lines with real captions |
| `PACK_INVALID` with scene frame mismatch | Scene grid too short | Set last `scenes[].end >= lastEndSec * fps + 45` |

## Boundaries

- `content/`, `public/`, `out/` and `*.mp4` are gitignored runtime artifacts; never add them to a repository.
- `src/`, `scripts/` and `remotion.config.ts` are the engine. A new topic must not require editing them.
- `examples/demo/` is a tracked, media-free English reference pack. Use it as the canonical schema example.
