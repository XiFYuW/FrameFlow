// Shared helpers for mounting a content pack into the runtime content dir.
//
// A content pack is a plain folder that lives anywhere on disk. The repository
// ships no media at all. Layout:
//   pack.json (optional)          manifest with an optional activeEpisode
//   episode.json                  single-episode pack
//   episodes/<id>.json            multi-episode pack
//   presets/render.json           canvas, fps/bpm, scene grid, features
//   presets/labels.json           transcript and publish copy templates
//   illustrations/<id>/scene_*    optional; generated when absent
//   assets/<file>                 optional font / audio referenced by the preset
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlaceholders } from "./placeholder.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTENT_DIR = path.join(ROOT, "content");
export const DEFAULT_PACK = path.join(ROOT, "examples", "demo");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const ILLUSTRATIONS_DIR = path.join(PUBLIC_DIR, "illustrations");

const VALUE_FLAGS = new Set(["--pack", "--episode"]);

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (key) => {
    const i = argv.indexOf(key);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[i])) i++;
      continue;
    }
    positional.push(argv[i]);
  }
  return { get, has: (key) => argv.includes(key), positional, raw: argv };
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function listEpisodeIds(packDir) {
  const dir = path.join(packDir, "episodes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.json$/i.test(f))
    .map((f) => f.replace(/\.json$/i, ""))
    .sort();
}

/** Resolve one episode config from either a single- or multi-episode pack. */
export function selectEpisode(packDir, requestedId) {
  const single = path.join(packDir, "episode.json");
  const ids = listEpisodeIds(packDir);

  if (requestedId) {
    if (!ids.includes(requestedId)) {
      throw new Error(
        `Episode "${requestedId}" not found in ${path.join(packDir, "episodes")}`
      );
    }
    return {
      id: requestedId,
      data: readJson(path.join(packDir, "episodes", `${requestedId}.json`)),
    };
  }

  if (existsSync(single)) {
    const data = readJson(single);
    return { id: data.id || "episode", data };
  }

  if (!ids.length) {
    throw new Error(`No episode.json and no episodes/ folder in ${packDir}`);
  }

  let id = null;
  const manifest = path.join(packDir, "pack.json");
  if (existsSync(manifest)) id = readJson(manifest).activeEpisode || null;
  const pointer = path.join(packDir, "current.json");
  if (!id && existsSync(pointer)) id = readJson(pointer).episode || null;
  if (!id || !ids.includes(id)) id = ids[ids.length - 1];

  return { id, data: readJson(path.join(packDir, "episodes", `${id}.json`)) };
}

/** Scene count and file names come from the preset; nothing is hardcoded. */
export function readRenderPreset(packDir) {
  const file = path.join(packDir, "presets", "render.json");
  if (!existsSync(file)) throw new Error(`Missing presets/render.json in ${packDir}`);
  const preset = readJson(file);
  if (!Array.isArray(preset.scenes) || preset.scenes.length === 0) {
    throw new Error(`presets/render.json needs a non-empty scenes array: ${file}`);
  }
  if (!existsSync(path.join(packDir, "presets", "labels.json"))) {
    throw new Error(`Missing presets/labels.json in ${packDir}`);
  }
  return {
    ...preset,
    sceneCount: preset.scenes.length,
    sceneFilePattern: preset.sceneFilePattern || "scene_{n}.png",
    width: preset.width || 1920,
    height: preset.height || 1080,
    fps: preset.fps || 30,
    bpm: preset.bpm || 96,
  };
}

/** Missing artwork is allowed: neutral placeholders are generated instead. */
export function validatePack(packDir, episodeData, preset) {
  if (!episodeData.illustrationsDir) {
    throw new Error("Episode config is missing illustrationsDir");
  }
  const src = path.join(packDir, "illustrations", episodeData.illustrationsDir);
  if (!existsSync(src)) return { illustrationSrc: src, hasArtwork: false };

  const missing = [];
  for (let n = 1; n <= preset.sceneCount; n++) {
    const file = preset.sceneFilePattern.replace("{n}", String(n));
    if (!existsSync(path.join(src, file))) missing.push(file);
  }
  if (missing.length) {
    throw new Error(`Missing illustrations in ${src}: ${missing.join(", ")}`);
  }
  return { illustrationSrc: src, hasArtwork: true };
}

/** Write the runtime content dir and materialize all binary assets. */
export function installPack({ packDir, episodeId }) {
  const source = path.resolve(packDir);
  if (!existsSync(source)) throw new Error(`Content pack not found: ${source}`);

  const preset = readRenderPreset(source);
  const { id, data } = selectEpisode(source, episodeId);
  const { illustrationSrc, hasArtwork } = validatePack(source, data, preset);

  rmSync(CONTENT_DIR, { recursive: true, force: true });
  mkdirSync(path.join(CONTENT_DIR, "presets"), { recursive: true });
  writeFileSync(
    path.join(CONTENT_DIR, "episode.json"),
    JSON.stringify(data, null, 2) + "\n"
  );
  for (const f of ["render.json", "labels.json"]) {
    writeFileSync(
      path.join(CONTENT_DIR, "presets", f),
      readFileSync(path.join(source, "presets", f))
    );
  }
  writeFileSync(
    path.join(CONTENT_DIR, "pack.json"),
    JSON.stringify(
      {
        source,
        episode: id,
        illustrationsDir: data.illustrationsDir,
        sceneCount: preset.sceneCount,
        schema: 2,
      },
      null,
      2
    ) + "\n"
  );

  const dest = path.join(ILLUSTRATIONS_DIR, data.illustrationsDir);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  let artwork;
  if (hasArtwork) {
    // Copy files individually: cpSync can crash Node on some Windows setups.
    for (let n = 1; n <= preset.sceneCount; n++) {
      const file = preset.sceneFilePattern.replace("{n}", String(n));
      copyFileSync(path.join(illustrationSrc, file), path.join(dest, file));
    }
    artwork = { mode: "copied", count: preset.sceneCount };
  } else {
    const result = generatePlaceholders({
      destDir: dest,
      count: preset.sceneCount,
      pattern: preset.sceneFilePattern,
      width: preset.width,
      height: preset.height,
    });
    artwork = { mode: "generated", count: result.count, bytes: result.bytes };
  }

  // Font and audio are optional assets supplied by the pack, never by the repo.
  const assets = [];
  for (const rel of [preset.audio?.src, preset.font?.file].filter(Boolean)) {
    const fromAssets = path.join(source, "assets", rel);
    const fromRoot = path.join(source, rel);
    const from = existsSync(fromAssets) ? fromAssets : existsSync(fromRoot) ? fromRoot : null;
    if (!from) {
      console.warn("Optional asset not found, skipping:", rel);
      continue;
    }
    const to = path.join(PUBLIC_DIR, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    assets.push(rel);
  }

  return {
    id,
    title: data.title || id,
    illustrationsDir: data.illustrationsDir,
    source,
    sceneCount: preset.sceneCount,
    width: preset.width,
    height: preset.height,
    fps: preset.fps,
    bpm: preset.bpm,
    artwork,
    assets,
  };
}
