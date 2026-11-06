// Scaffold a content pack for a new video topic.
// Deterministic part of the agent workflow: the model only writes the script.
//
// CLI:
//   node scripts/new-pack.mjs --dir <packDir> --title "<title>" [options]
//   npm run pack:new -- --dir <packDir> --title "<title>" --seconds 60 --vertical
//
// Options:
//   --id <id>          episode id, lowercase [a-z0-9_-]  (default: derived from title)
//   --title <text>     human-readable video title
//   --series <text>    series name used in publish copy
//   --seconds <n>      script duration in seconds        (default: 40)
//   --scenes <n>       number of illustration scenes    (default: 4)
//   --vertical         use a 1080x1920 canvas
//   --square           use a 1080x1080 canvas
//   --fps <n>          frames per second                (default: 30)
//   --bpm <n>          beat grid tempo                  (default: 96)
//   --force            overwrite an existing pack
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT, DEFAULT_PACK } from "./content-lib.mjs";

const argv = process.argv.slice(2);
const flags = {};
const booleans = new Set(["vertical", "square", "force"]);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  if (booleans.has(key)) {
    flags[key] = true;
  } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
    flags[key] = argv[++i];
  } else {
    flags[key] = true;
  }
}

const fail = (msg) => {
  console.error("Pack scaffold failed:", msg);
  console.error(
    'Usage: npm run pack:new -- --dir <packDir> --title "<title>" [--seconds 60] [--vertical]'
  );
  process.exit(1);
};

const dir = flags.dir ? path.resolve(flags.dir) : null;
const title = flags.title;
if (!dir) fail("--dir is required");
if (!title) fail("--title is required");
if (existsSync(dir) && !flags.force) {
  fail(`Target already exists (use --force to overwrite): ${dir}`);
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "episode";
const id = flags.id || slug(title);
if (!/^[a-z0-9_-]+$/.test(id)) fail("--id must match [a-z0-9_-]+");

const seconds = Math.max(8, Number(flags.seconds) || 40);
const sceneCount = Math.max(1, Math.min(24, Number(flags.scenes) || 4));
const fps = Math.max(1, Number(flags.fps) || 30);
const bpm = Math.max(1, Number(flags.bpm) || 96);
const width = flags.vertical ? 1080 : flags.square ? 1080 : 1920;
const height = flags.vertical ? 1920 : flags.square ? 1080 : 1080;
const totalFrames = Math.round(seconds * fps) + 45; // 45 tail frames added by Root.tsx

// Split the timeline into contiguous scene windows that cover the whole film.
const motion = [
  [1.0, 1.08, 0, 20, 0, -12],
  [1.04, 1.0, -16, 16, 10, -16],
  [1.0, 1.1, 18, -14, -8, 18],
  [1.02, 1.06, 0, -20, 8, 0],
];
const scenes = Array.from({ length: sceneCount }, (_, i) => {
  const start = Math.round((i / sceneCount) * totalFrames);
  const end =
    i === sceneCount - 1
      ? totalFrames
      : Math.round(((i + 1) / sceneCount) * totalFrames);
  const [z0, z1, tx0, tx1, ty0, ty1] = motion[i % motion.length];
  return { index: i + 1, start, end, z0, z1, tx0, tx1, ty0, ty1 };
});

const TRANSITIONS = [
  "fade",
  "slideLeft",
  "zoom",
  "blur",
  "circleWipe",
  "slideRight",
  "wipeDown",
  "iris",
  "shutter",
  "flip",
  "slideDown",
  "slideUp",
];
const transitions = Array.from({ length: Math.max(1, sceneCount - 1) }, (_, i) =>
  TRANSITIONS[i % TRANSITIONS.length]
);

const render = {
  width,
  height,
  fps,
  bpm,
  crossfadeFrames: Math.max(1, Math.min(32, Math.round(fps * 0.8))),
  sceneFilePattern: "scene_{n}.png",
  scenes,
  transitions,
  brandTitle: "",
  chapterPrefix: "CHAPTER",
  chapterSuffix: "",
  chapterNumerals: ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"],
  quoteFallback: "SOURCE",
  audio: null,
  font: null,
  features: {
    seasonMotif: false,
    watermark: false,
    taiji: false,
    brandMark: true,
    chapterLabel: true,
    chapterSplash: true,
    sealStamp: false,
    quoteCard: true,
    particles: true,
    beatIndicator: true,
    progressBar: true,
    subtitle: true,
  },
};

const episode = {
  id,
  index: 1,
  title,
  theme: "",
  brandSubtitle: title,
  illustrationsDir: id,
  publish: {
    series: flags.series || title,
    episodeTitle: title,
    titles: [`TODO: title option 1 for ${title}`],
    content: `TODO: one-paragraph description of ${title}`,
    hashtags: ["video"],
    cta: "TODO: call to action",
  },
  script: {
    segments: [
      {
        chapter: "Opening",
        startSec: 0,
        endSec: seconds,
        lines: [
          { text: "TODO: opening line" },
          { text: "TODO: second line" },
          { text: "TODO: third line" },
          { text: "TODO: closing line" },
        ],
      },
    ],
  },
};

mkdirSync(path.join(dir, "presets"), { recursive: true });
writeFileSync(path.join(dir, "presets", "render.json"), JSON.stringify(render, null, 2) + "\n");
copyFileSync(
  path.join(DEFAULT_PACK, "presets", "labels.json"),
  path.join(dir, "presets", "labels.json")
);
writeFileSync(path.join(dir, "episode.json"), JSON.stringify(episode, null, 2) + "\n");
writeFileSync(
  path.join(dir, "pack.json"),
  JSON.stringify(
    {
      id,
      title,
      language: "en",
      episodeCount: 1,
      sceneCount,
      activeEpisode: id,
      schema: 2,
    },
    null,
    2
  ) + "\n"
);

const fwd = (p) => p.replace(/\\/g, "/");
console.log(`Pack scaffolded: ${fwd(dir)}`);
console.log(`  episode:   ${id} (${title})`);
console.log(`  canvas:    ${width}x${height} @ ${fps}fps, ${bpm} BPM`);
console.log(`  duration:  ${seconds}s script + 45 tail frames = ${totalFrames} frames`);
console.log(`  scenes:    ${sceneCount} (placeholders are generated on mount)`);
console.log("");
console.log("Next steps for the agent:");
console.log(`  1. Edit ${fwd(path.join(dir, "episode.json"))} and replace every TODO line.`);
console.log(`  2. npm run pack:check -- ${fwd(dir)}`);
console.log(`  3. npm run content:load -- ${fwd(dir)}`);
