// Validate a content pack before mounting it into the render pipeline.
// Pure Node, no dependencies. Designed to be called by an AI agent.
//
// CLI:
//   npm run pack:check -- <packDir>
//   node scripts/validate-content.mjs --dir <packDir> --json
//
// Exit code 0 = pack is safe to mount; 1 = errors must be fixed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_PACK } from "./content-lib.mjs";

const argv = process.argv.slice(2);
const positional = [];
let dirFlag = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") {
    dirFlag = argv[++i] || null;
  } else if (!argv[i].startsWith("--")) {
    positional.push(argv[i]);
  }
}
const dir = path.resolve(dirFlag || positional[0] || DEFAULT_PACK);
const asJson = argv.includes("--json");

const TRANSITIONS = [
  "fade", "slideLeft", "slideRight", "slideUp", "slideDown",
  "zoom", "blur", "wipeDown", "circleWipe", "iris", "shutter", "flip",
];
const FEATURES = [
  "seasonMotif", "watermark", "taiji", "brandMark", "chapterLabel",
  "chapterSplash", "sealStamp", "quoteCard", "particles",
  "beatIndicator", "progressBar", "subtitle",
];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const LABEL_PATHS = [
  "scriptDoc.title", "scriptDoc.duration", "scriptDoc.chapter",
  "scriptDoc.tag", "scriptDoc.numerals", "scriptDoc.fallbackTitle",
  "publish.header", "publish.dividerWidth", "publish.headings.titles",
  "publish.headings.content", "publish.headings.hashtags",
  "publish.headings.cta", "publish.headings.copy",
  "publish.titleWarning", "publish.maxTitle",
  "publish.draft.titleFirstLine", "publish.draft.titleFromChapter",
  "publish.draft.titleQuestion", "publish.draft.content",
  "publish.draft.cta", "publish.draft.hashtags",
  "publish.draft.chapterSeparator", "publish.fallbacks.series",
  "publish.fallbacks.keyword", "publish.fallbacks.chapter",
  "publish.fallbacks.episodeTitle",
  "files.subtitles", "files.script", "files.publishText",
  "files.publishJson", "files.preview",
];
const PUBLISH_FIELDS = ["series", "episodeTitle", "titles", "content", "hashtags", "cta"];

const errors = [];
const warnings = [];
const info = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const note = (m) => info.push(m);

const readJson = (file, label) => {
  if (!existsSync(file)) {
    err(`Missing ${label}: ${file}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    err(`Invalid JSON in ${label}: ${e.message}`);
    return null;
  }
};
const at = (obj, dotted) =>
  dotted.split(".").reduce((v, k) => (v == null ? undefined : v[k]), obj);

const report = { pack: dir, ok: false, errors, warnings, info: [] };
if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  err(`Content pack directory not found: ${dir}`);
  finish();
}

// ---- render preset -------------------------------------------------------
const preset = readJson(path.join(dir, "presets", "render.json"), "presets/render.json");
const fps = preset?.fps || 30;
let totalFrames = 0;
let sceneCount = 0;

if (preset) {
  for (const key of ["width", "height", "fps", "bpm"]) {
    if (!Number.isFinite(preset[key]) || preset[key] <= 0) {
      err(`presets/render.json: "${key}" must be a positive number`);
    }
  }
  if (!Number.isFinite(preset.crossfadeFrames) || preset.crossfadeFrames < 1) {
    err('presets/render.json: "crossfadeFrames" must be a positive number');
  }
  if (typeof preset.sceneFilePattern !== "string" || !preset.sceneFilePattern.includes("{n}")) {
    err('presets/render.json: "sceneFilePattern" must contain the {n} placeholder');
  }
  if (!/^[\w\-./{}]+$/.test(preset.sceneFilePattern || "")) {
    err('presets/render.json: "sceneFilePattern" contains unsupported characters');
  }

  const scenes = preset.scenes;
  if (!Array.isArray(scenes) || !scenes.length) {
    err('presets/render.json: "scenes" must be a non-empty array');
  } else {
    sceneCount = scenes.length;
    if (scenes[0].start !== 0) err("scenes[0].start must be 0");
    let shortest = Infinity;
    scenes.forEach((s, i) => {
      if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) {
        err(`scenes[${i}]: end must be greater than start`);
      } else {
        shortest = Math.min(shortest, s.end - s.start);
      }
      if (i > 0 && s.start !== scenes[i - 1].end) {
        err(`scenes[${i}].start must equal scenes[${i - 1}].end (no gaps or overlaps)`);
      }
      for (const k of ["z0", "z1", "tx0", "tx1", "ty0", "ty1"]) {
        if (!Number.isFinite(s[k])) err(`scenes[${i}].${k} must be a number`);
      }
    });
    if (preset.crossfadeFrames >= shortest) {
      warn(`crossfadeFrames (${preset.crossfadeFrames}) is not shorter than the shortest scene (${shortest} frames)`);
    }
  }

  if (!Array.isArray(preset.transitions) || !preset.transitions.length) {
    err('presets/render.json: "transitions" must be a non-empty array');
  } else {
    preset.transitions.forEach((t, i) => {
      if (!TRANSITIONS.includes(t)) {
        err(`transitions[${i}]: unknown type "${t}". Allowed: ${TRANSITIONS.join(", ")}`);
      }
    });
    if (sceneCount > 1 && preset.transitions.length < sceneCount - 1) {
      note("Fewer transitions than scene boundaries; the list will repeat.");
    }
  }

  if (!Array.isArray(preset.chapterNumerals)) {
    err('presets/render.json: "chapterNumerals" must be an array');
  }
  for (const f of ["brandTitle", "chapterPrefix", "chapterSuffix", "quoteFallback"]) {
    if (typeof preset[f] !== "string") err(`presets/render.json: "${f}" must be a string`);
  }
  if (preset.features) {
    for (const key of Object.keys(preset.features)) {
      if (!FEATURES.includes(key)) warn(`Unknown feature flag "${key}" is ignored by the renderer`);
      else if (typeof preset.features[key] !== "boolean") err(`features.${key} must be a boolean`);
    }
    if (preset.features.subtitle === false) warn("subtitle is disabled; the video will have no captions");
  } else {
    note('No "features" object: optional visual modules default to off.');
  }

  // Optional binary assets must be supplied by the pack, never by the repo.
  for (const [key, value] of [["audio", preset.audio?.src], ["font", preset.font?.file]]) {
    if (!value) continue;
    if (typeof value !== "string" || value.startsWith("/") || value.includes("..")) {
      err(`presets/render.json: ${key} path must be relative and stay inside public/`);
      continue;
    }
    const fromAssets = path.join(dir, "assets", value);
    const fromRoot = path.join(dir, value);
    if (!existsSync(fromAssets) && !existsSync(fromRoot)) {
      err(`${key} asset not found in the pack: ${value}`);
    }
  }
  if (preset.audio && !Number.isFinite(preset.audio.volume)) {
    err('presets/render.json: audio.volume must be a number');
  }
  if (preset.font && typeof preset.font.family !== "string") {
    err('presets/render.json: font.family must be a string');
  }
}

// ---- labels template -----------------------------------------------------
const labels = readJson(path.join(dir, "presets", "labels.json"), "presets/labels.json");
if (labels) {
  for (const key of LABEL_PATHS) {
    if (at(labels, key) === undefined) err(`presets/labels.json: missing "${key}"`);
  }
  if (!Array.isArray(labels.scriptDoc?.numerals)) {
    err('presets/labels.json: scriptDoc.numerals must be an array');
  }
  if (!Array.isArray(labels.publish?.draft?.hashtags)) {
    err('presets/labels.json: publish.draft.hashtags must be an array');
  }
}

// ---- episodes ------------------------------------------------------------
const single = path.join(dir, "episode.json");
const epsDir = path.join(dir, "episodes");
const episodeFiles = [];
if (existsSync(single)) episodeFiles.push(single);
if (existsSync(epsDir)) {
  for (const f of readdirSync(epsDir).filter((f) => f.endsWith(".json")).sort()) {
    episodeFiles.push(path.join(epsDir, f));
  }
}
if (!episodeFiles.length) {
  err("No episode.json and no episodes/*.json found in the pack");
}

let cueCount = 0;
let chapterCount = 0;
let longestScript = 0;
const ids = new Set();

for (const file of episodeFiles) {
  const rel = path.relative(dir, file).replace(/\\/g, "/");
  const ep = readJson(file, rel);
  if (!ep) continue;
  if (typeof ep.id !== "string" || !/^[a-z0-9_-]+$/.test(ep.id)) {
    err(`${rel}: "id" must match [a-z0-9_-]+`);
  } else if (ids.has(ep.id)) {
    err(`${rel}: duplicate episode id "${ep.id}"`);
  } else {
    ids.add(ep.id);
  }
  if (typeof ep.title !== "string" || !ep.title.trim()) err(`${rel}: "title" is required`);
  if (typeof ep.illustrationsDir !== "string" || /[\\/]/.test(ep.illustrationsDir || "")) {
    err(`${rel}: "illustrationsDir" must be a single directory name`);
  }
  if (ep.season && !SEASONS.includes(ep.season)) {
    err(`${rel}: "season" must be one of ${SEASONS.join(", ")}`);
  }
  if (ep.publish) {
    for (const key of PUBLISH_FIELDS) {
      if (ep.publish[key] === undefined) warn(`${rel}: publish.${key} is missing; auto-draft will be used`);
    }
  } else {
    warn(`${rel}: no publish object; publish copy will be auto-drafted`);
  }

  const segments = ep.script?.segments;
  if (!Array.isArray(segments) || !segments.length) {
    err(`${rel}: script.segments must be a non-empty array`);
    continue;
  }
  if (segments[0].startSec !== 0) err(`${rel}: first segment must start at 0`);
  segments.forEach((seg, i) => {
    chapterCount++;
    if (typeof seg.chapter !== "string" || !seg.chapter.trim()) {
      err(`${rel}: segment ${i} needs a chapter name`);
    }
    if (!Number.isFinite(seg.startSec) || !Number.isFinite(seg.endSec) || seg.endSec <= seg.startSec) {
      err(`${rel}: segment ${i} needs startSec < endSec`);
    }
    if (i > 0 && seg.startSec !== segments[i - 1].endSec) {
      err(`${rel}: segment ${i}.startSec must equal segment ${i - 1}.endSec`);
    }
    if (!Array.isArray(seg.lines) || !seg.lines.length) {
      err(`${rel}: segment ${i} needs at least one line`);
      return;
    }
    if (seg.lines.length < 2) warn(`${rel}: segment ${i} has a single line; captions will be very long`);
    for (const [j, line] of seg.lines.entries()) {
      cueCount++;
      if (typeof line.text !== "string" || !line.text.trim()) {
        err(`${rel}: segment ${i} line ${j} has no text`);
        continue;
      }
      if (line.text.includes("TODO")) {
        err(`${rel}: segment ${i} line ${j} still contains a TODO placeholder`);
      }
      if (line.text.length > 90) {
        warn(`${rel}: segment ${i} line ${j} is ${line.text.length} chars; captions may overflow`);
      }
      for (const phrase of line.em || []) {
        if (typeof phrase !== "string" || !line.text.includes(phrase)) {
          err(`${rel}: segment ${i} line ${j} em "${phrase}" is not an exact substring of text`);
        }
      }
    }
    if (seg.quote && (typeof seg.quote.text !== "string" || !seg.quote.text.trim())) {
      err(`${rel}: segment ${i} quote.text is empty`);
    }
  });
  const lastEnd = segments.at(-1).endSec;
  longestScript = Math.max(longestScript, lastEnd);
  totalFrames = Math.max(totalFrames, Math.round(lastEnd * fps) + 45);
}

// Scene grid must cover the film, including the 45 tail frames.
if (preset && Array.isArray(preset.scenes) && preset.scenes.length) {
  const lastSceneEnd = preset.scenes.at(-1).end;
  if (Number.isFinite(lastSceneEnd) && lastSceneEnd < totalFrames) {
    err(
      `Scene grid ends at frame ${lastSceneEnd} but the film needs ${totalFrames} frames ` +
        `(${longestScript}s script + 45 tail frames). Extend the last scene.`
    );
  }
  const illDirs = [...new Set(episodeFiles.map((f) => {
    try { return JSON.parse(readFileSync(f, "utf8")).illustrationsDir; } catch { return null; }
  }).filter(Boolean))];
  for (const illDir of illDirs) {
    const src = path.join(dir, "illustrations", illDir);
    if (!existsSync(src)) {
      note(`No illustrations/${illDir}: neutral placeholders will be generated on mount.`);
      continue;
    }
    const missing = [];
    for (let n = 1; n <= sceneCount; n++) {
      const name = (preset.sceneFilePattern || "scene_{n}.png").replace("{n}", String(n));
      if (!existsSync(path.join(src, name))) missing.push(name);
    }
    if (missing.length) {
      err(`illustrations/${illDir} is incomplete: missing ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " ..." : ""}`);
    } else {
      note(`illustrations/${illDir}: ${sceneCount} scene images found.`);
    }
  }
}

report.ok = errors.length === 0;
report.summary = {
  episodes: ids.size,
  chapters: chapterCount,
  cues: cueCount,
  scenes: sceneCount,
  fps,
  scriptSeconds: longestScript,
  filmFrames: totalFrames,
};
report.info = info;
finish();

function finish() {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`${report.ok ? "PACK_OK" : "PACK_INVALID"}  ${dir}`);
    if (report.summary) {
      const s = report.summary;
      console.log(
        `  ${s.episodes} episode(s) | ${s.chapters} chapters | ${s.cues} cues | ` +
          `${s.scenes} scenes | ${s.scriptSeconds}s script | ${s.filmFrames} frames @ ${s.fps}fps`
      );
    }
    for (const m of info) console.log(`  info:  ${m}`);
    for (const m of warnings) console.log(`  warn:  ${m}`);
    for (const m of errors) console.log(`  ERROR: ${m}`);
    console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)`);
    if (!report.ok) console.log("  Fix the errors above, then re-run this check before mounting.");
  }
  process.exit(report.ok ? 0 : 1);
}
