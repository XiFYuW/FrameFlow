// Install a content pack into the runtime content/ directory.
// The repository contains only code and JSON: fonts, audio and artwork are
// supplied by a pack, or generated as neutral placeholders for the demo.
//
// CLI:
//   node scripts/init-content.mjs
//   node scripts/init-content.mjs --if-missing
//   node scripts/init-content.mjs --pack <packDir> [--episode <id>]
import { existsSync } from "node:fs";
import path from "node:path";
import {
  CONTENT_DIR,
  DEFAULT_PACK,
  installPack,
  parseArgs,
} from "./content-lib.mjs";

const args = parseArgs();

// postinstall uses this flag so an existing (possibly custom) pack is kept.
if (args.has("--if-missing") && existsSync(path.join(CONTENT_DIR, "episode.json"))) {
  process.exit(0);
}

const packDir = args.get("--pack") || DEFAULT_PACK;
const episodeId = args.get("--episode") || null;

try {
  const info = installPack({ packDir, episodeId });
  console.log(`Content ready: ${info.id} (${info.title})`);
  console.log(`  pack:          ${info.source}`);
  console.log(`  canvas:        ${info.width}x${info.height} @ ${info.fps}fps, ${info.bpm} BPM`);
  console.log(`  runtime data:  content/episode.json + content/presets/`);
  console.log(
    `  artwork:       public/illustrations/${info.illustrationsDir} (${info.artwork.count} scenes, ${info.artwork.mode})`
  );
  if (info.assets.length) console.log(`  assets:        ${info.assets.join(", ")}`);
} catch (err) {
  console.error("Content install failed:", err.message);
  process.exit(1);
}
