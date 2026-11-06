// Export subtitle and transcript assets from the active timeline.
// esbuild bundles the TS module (and its JSON episode data) on the fly,
// so no separate build step is required.
import { build } from "esbuild";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const FPS_DEFAULT = 30;
const LABELS = JSON.parse(
  readFileSync(new URL("../content/presets/labels.json", import.meta.url), "utf8")
);

const pad = (n, len = 2) => String(n).padStart(len, "0");
const tpl = (text, vars) =>
  text.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] === undefined ? "" : String(vars[key])
  );

function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${pad(m)}:${pad(s)}`;
}

/** Transpile the timeline module to ESM and import it as a Node module. */
export async function loadTimeline(srcPath = "src/timeline.ts") {
  const result = await build({
    entryPoints: [srcPath],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const tmp = path.join(
    tmpdir(),
    `timeline_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`
  );
  writeFileSync(tmp, result.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}

/** Build an SRT file from the cue timeline. */
export async function buildSrt(mod) {
  const FPS = mod.FPS || FPS_DEFAULT;
  const cues = mod.cues || [];
  const blocks = cues.map((c, i) => {
    const start = srtTime(c.start / FPS);
    const end = srtTime(c.end / FPS);
    return `${i + 1}\n${start} --> ${end}\n${c.text}\n`;
  });
  return blocks.join("\n");
}

/** Build a chapter-organized transcript document. */
export async function buildScriptDoc(mod, opts = {}) {
  const L = LABELS.scriptDoc;
  const FPS = mod.FPS || FPS_DEFAULT;
  const segments = mod.segments || [];
  const title = opts.title || L.fallbackTitle;
  const lines = [tpl(L.title, { title }), ""];
  const totalSec = segments.length ? segments[segments.length - 1].endSec : 0;
  lines.push(tpl(L.duration, { duration: mmss(totalSec), fps: FPS }), "");

  segments.forEach((seg, i) => {
    const num = L.numerals[i] || i + 1;
    lines.push(
      tpl(L.chapter, {
        num,
        chapter: seg.chapter,
        start: mmss(seg.startSec),
        end: mmss(seg.endSec),
      })
    );
    seg.lines.forEach((ln) => {
      const prefix = ln.tag ? tpl(L.tag, { tag: ln.tag }) : "";
      lines.push(`- ${prefix}${ln.text}`);
    });
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

// CLI: node scripts/export-subtitles.mjs --src src/timeline.ts --srt out/demo.srt --txt out/demo.txt --title "Inside the Pipeline"
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const get = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const src = get("--src") || "src/timeline.ts";
  const srtOut = get("--srt");
  const txtOut = get("--txt");
  const title = get("--title");
  const mod = await loadTimeline(src);
  if (srtOut) {
    mkdirSync(path.dirname(srtOut), { recursive: true });
    writeFileSync(srtOut, await buildSrt(mod));
    console.log("wrote", srtOut);
  }
  if (txtOut) {
    mkdirSync(path.dirname(txtOut), { recursive: true });
    writeFileSync(txtOut, await buildScriptDoc(mod, { title }));
    console.log("wrote", txtOut);
  }
  if (!srtOut && !txtOut) {
    console.log(await buildScriptDoc(mod, { title }));
  }
}
