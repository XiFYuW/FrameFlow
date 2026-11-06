// Resolve the FrameFlow repository root from an installed skill copy.
// Self-contained on purpose: it runs before the repository path is known, so it
// imports nothing from the repository and has no third-party dependencies.
//
//   node resolve-root.mjs            print the absolute root (one line)
//   node resolve-root.mjs --json     print { ok, root, source, hintStale }
//   node resolve-root.mjs --check    print ROOT_OK with the discovery source
//
// Discovery order (first valid match wins):
//   1. FRAMEFLOW_ROOT environment variable (explicit override)
//   2. Walk up from this script (project-level installs follow the repository)
//   3. Walk up from the current working directory
//   4. local.json root (validated cache hint, mainly for user-level installs)
//
// A directory counts as the repository only when package.json has
// name === "frameflow" AND skills/frameflow/SKILL.md exists.
//
// Exit code: 0 when a valid repository is found, 1 otherwise.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const REPO_NAME = "frameflow";
const MAX_DEPTH = 8;
const MARKER = path.join("skills", "frameflow", "SKILL.md");

const isRepo = (dir) => {
  if (!dir) return false;
  try {
    const pkg = path.join(dir, "package.json");
    if (!existsSync(pkg) || !existsSync(path.join(dir, MARKER))) return false;
    return JSON.parse(readFileSync(pkg, "utf8")).name === REPO_NAME;
  } catch {
    return false;
  }
};

const norm = (p) => path.resolve(p).replace(/\\/g, "/");

const walkUp = (start) => {
  const out = [];
  let dir = start;
  for (let i = 0; i < MAX_DEPTH; i++) {
    out.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
};

let hint = null;
try {
  hint = JSON.parse(readFileSync(path.join(HERE, "local.json"), "utf8")).root || null;
} catch {
  // The source skill directory has no local.json; discovery still works.
}

const candidates = [];
if (process.env.FRAMEFLOW_ROOT) {
  candidates.push(["env:FRAMEFLOW_ROOT", process.env.FRAMEFLOW_ROOT]);
}
for (const dir of walkUp(HERE)) candidates.push(["skill-relative", dir]);
for (const dir of walkUp(process.cwd())) candidates.push(["cwd", dir]);
if (hint) candidates.push(["local.json", hint]);

const found = candidates.find(([, dir]) => isRepo(dir));
const hintStale = !!hint && !isRepo(hint);

if (!found) {
  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: false,
      error: "ROOT_NOT_FOUND",
      hint: hint ? norm(hint) : null,
      hintStale,
    }, null, 2));
  } else {
    console.error("ROOT_NOT_FOUND: could not locate the FrameFlow repository.");
    if (hintStale) console.error(`  Cached root is stale: ${norm(hint)}`);
    console.error("  Set FRAMEFLOW_ROOT=<absolute path>, or refresh the install:");
    console.error("    npm run skill:install -- --target <name> --force");
  }
  process.exitCode = 1;
} else {
  const [source, dir] = found;
  const root = norm(dir);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({
      ok: true,
      root,
      source,
      hintStale,
      hint: hint ? norm(hint) : null,
    }, null, 2));
  } else if (argv.includes("--check")) {
    console.log(`ROOT_OK ${root} (via ${source}${hintStale ? ", cached root was stale" : ""})`);
  } else {
    console.log(root);
  }
}
