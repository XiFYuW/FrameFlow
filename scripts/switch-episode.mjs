// Switch the active episode inside the mounted content pack.
// Only the runtime content/ directory changes; no source file is edited.
//
// CLI: node scripts/switch-episode.mjs ep17 [--pack <packDir>]
import { existsSync } from "node:fs";
import path from "node:path";
import {
  CONTENT_DIR,
  DEFAULT_PACK,
  installPack,
  listEpisodeIds,
  parseArgs,
  readJson,
} from "./content-lib.mjs";

const args = parseArgs();
const id = args.positional[0] || null;

if (!id || !/^[a-z0-9_-]+$/i.test(id)) {
  console.error("Usage: node scripts/switch-episode.mjs <episodeId> [--pack <dir>]");
  process.exit(1);
}

const pointer = path.join(CONTENT_DIR, "pack.json");
let source = args.get("--pack");
if (!source && existsSync(pointer)) source = readJson(pointer).source;
if (!source) source = DEFAULT_PACK;

if (!listEpisodeIds(source).length) {
  console.error(`Content pack "${source}" has a single episode. Nothing to switch.`);
  console.error("Mount a multi-episode pack: npm run content:load -- <packDir> --episode <id>");
  process.exit(1);
}

try {
  const info = installPack({ packDir: source, episodeId: id });
  console.log(`Active episode: ${info.id} (${info.title}) | ${info.sceneCount} scenes`);
} catch (err) {
  console.error("Switch failed:", err.message);
  process.exit(1);
}
