// Package one episode's delivery assets:
//   1) rename the rendered master and preview MP4
//   2) export timed subtitles (.srt)
//   3) export the chapter-organized transcript (.txt)
//   4) generate publish copy (.txt / .json)
//
// CLI:
//   node scripts/deliver.mjs --name demo --src src/timeline.ts \
//     --profile content/episode.json --render out/frameflow.mp4 \
//     --title "Inside the Pipeline"
import { renameSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadTimeline, buildSrt, buildScriptDoc } from "./export-subtitles.mjs";
import { generatePublish, formatPublishText } from "./gen-publish.mjs";

const LABELS = JSON.parse(
  readFileSync(new URL("../content/presets/labels.json", import.meta.url), "utf8")
);
const F = LABELS.files;

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};

const profilePath = get("--profile") || "content/episode.json";
const profile = JSON.parse(readFileSync(profilePath, "utf8"));
const name = get("--name") || profile.id || "episode";
const src = get("--src") || "src/timeline.ts";
const renderPath = get("--render") || "out/frameflow.mp4";
const outDir = get("--out") || "out";
const scriptTitle = get("--title") || name;

const mod = await loadTimeline(src);
mkdirSync(outDir, { recursive: true });

writeFileSync(path.join(outDir, name + F.subtitles), await buildSrt(mod));
writeFileSync(
  path.join(outDir, name + F.script),
  await buildScriptDoc(mod, { title: scriptTitle })
);

const data = await generatePublish(mod, profile, { series: profile.publish?.series });
const pubText = formatPublishText(data);
writeFileSync(path.join(outDir, name + F.publishText), pubText);
writeFileSync(path.join(outDir, name + F.publishJson), JSON.stringify(data, null, 2));

const renderTarget = path.join(outDir, `${name}.mp4`);
if (existsSync(renderPath)) {
  renameSync(renderPath, renderTarget);
  console.log("renamed", renderPath, "->", renderTarget);
} else {
  console.warn("Render file not found, skipping rename:", renderPath);
}
const previewSrc = renderPath.replace(/(\.mp4)$/i, "_crf23$1");
const previewTarget = path.join(outDir, name + F.preview);
if (existsSync(previewSrc)) {
  renameSync(previewSrc, previewTarget);
  console.log("renamed", previewSrc, "->", previewTarget);
}

console.log(`\nDelivery assets for ${name} written to ${outDir}/`);
const written = [
  `${name}${F.subtitles}`,
  `${name}${F.script}`,
  `${name}${F.publishText} / ${name}${F.publishJson}`,
];
if (existsSync(renderTarget)) written.unshift(`${name}.mp4 (master)`);
if (existsSync(previewTarget)) written.unshift(`${name}${F.preview} (CRF23 preview)`);
for (const item of written) console.log(`   - ${item}`);
if (!existsSync(renderTarget)) {
  console.warn("Master render not found: text artifacts only. Run npm run render first.");
}
