// Install the FrameFlow skill into any agent that reads SKILL.md files.
// The installed copy is self-contained: SKILL.md, references/,
// resolve-root.mjs (repository discovery) and local.json (cache hint).
//
// CLI:
//   npm run skill:install -- --list
//   npm run skill:install -- --dir /absolute/path/to/skills/frameflow
//   npm run skill:install -- --target <name> --force
//   npm run skill:install -- --check        (validate frontmatter only)
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./content-lib.mjs";

const SOURCE = path.join(ROOT, "skills", "frameflow");
const RESOLVER = path.join(SOURCE, "resolve-root.mjs");
const ALLOWED_FIELDS = [
  "name", "description", "license", "compatibility", "metadata", "allowed-tools",
];

const argv = process.argv.slice(2);
const value = (key) => {
  const i = argv.indexOf(key);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : null;
};
const has = (key) => argv.includes(key);

const targets = {
  "workbuddy-project": path.join(ROOT, ".workbuddy", "skills", "frameflow"),
  "workbuddy-user": path.join(os.homedir(), ".workbuddy", "skills", "frameflow"),
  "claude-project": path.join(ROOT, ".claude", "skills", "frameflow"),
  "claude-user": path.join(os.homedir(), ".claude", "skills", "frameflow"),
};

if (has("--list")) {
  console.log("Available install targets:");
  for (const [name, dir] of Object.entries(targets)) {
    console.log(`  ${name.padEnd(20)} ${dir.replace(/\\/g, "/")}`);
  }
  console.log("  --dir <path>             any custom skills directory");
  process.exit(0);
}

// ---- Frontmatter validation (Agent Skills spec, portable across vendors) ----
const skillFile = path.join(SOURCE, "SKILL.md");
if (!existsSync(skillFile)) {
  console.error("Skill source not found:", skillFile);
  process.exit(1);
}
if (!existsSync(RESOLVER)) {
  console.error("Skill resolver not found:", RESOLVER);
  process.exit(1);
}
const text = readFileSync(skillFile, "utf8");
const lines = text.split(/\r?\n/);
if (lines[0] !== "---") {
  console.error("SKILL.md must start with a YAML frontmatter delimiter on line 1.");
  process.exit(1);
}
const end = lines.indexOf("---", 1);
if (end < 0) {
  console.error("SKILL.md frontmatter is not closed with ---.");
  process.exit(1);
}
const fields = lines
  .slice(1, end)
  .filter((l) => /^[a-z-]+\s*:/.test(l))
  .map((l) => l.split(":")[0].trim());
const unknown = fields.filter((f) => !ALLOWED_FIELDS.includes(f));
if (unknown.length) {
  console.error(`Unsupported frontmatter field(s): ${unknown.join(", ")}`);
  console.error(`Portable Agent Skills allows only: ${ALLOWED_FIELDS.join(", ")}`);
  process.exit(1);
}
for (const required of ["name", "description"]) {
  if (!fields.includes(required)) {
    console.error(`SKILL.md frontmatter is missing "${required}".`);
    process.exit(1);
  }
}
if (has("--check")) {
  console.log(`SKILL_CHECK_OK  fields: ${fields.join(", ")} | body: ${lines.length - end - 1} lines | resolver: present`);
  process.exit(0);
}

// ---- Resolve destination -------------------------------------------------
const targetName = value("--target");
let dest = value("--dir") ? path.resolve(value("--dir")) : null;
if (targetName) {
  if (!targets[targetName]) {
    console.error(`Unknown target "${targetName}". Run with --list to see options.`);
    process.exit(1);
  }
  dest = targets[targetName];
}
if (!dest) {
  console.error("Choose --target <name> or --dir <absolute path>. Use --list for targets.");
  process.exit(1);
}
if (path.resolve(dest) === SOURCE) {
  console.error("Destination is the skill source directory; nothing to install.");
  process.exit(1);
}
if (existsSync(dest) && !has("--force")) {
  console.error(`Already installed at ${dest} (use --force to refresh):`);
  process.exit(1);
}

const copied = [];
mkdirSync(path.join(dest, "references"), { recursive: true });
copyFileSync(skillFile, path.join(dest, "SKILL.md"));
copied.push("SKILL.md");
copyFileSync(RESOLVER, path.join(dest, "resolve-root.mjs"));
copied.push("resolve-root.mjs");
for (const f of readdirSync(path.join(SOURCE, "references")).filter((f) => f.endsWith(".md"))) {
  copyFileSync(path.join(SOURCE, "references", f), path.join(dest, "references", f));
  copied.push(`references/${f}`);
}

// root is a cache hint only. resolve-root.mjs validates it and re-discovers
// the repository from its own location, so a moved or renamed project stays usable.
writeFileSync(
  path.join(dest, "local.json"),
  JSON.stringify(
    {
      schema: 2,
      root: ROOT.replace(/\\/g, "/"),
      rootIsHint: true,
      repoName: "frameflow",
      source: SOURCE.replace(/\\/g, "/"),
      target: targetName || "custom",
      installedAt: new Date().toISOString(),
    },
    null,
    2
  ) + "\n"
);
copied.push("local.json");

console.log(`Skill installed: ${dest}`);
for (const f of copied) console.log(`  ${f}`);
console.log(`FrameFlow root (cache hint): ${ROOT.replace(/\\/g, "/")}`);
console.log("");
console.log("Repository discovery: node <skill-dir>/resolve-root.mjs");
console.log("  Project-level installs survive a move or rename without reinstalling.");
console.log("");
console.log("Trigger examples (any model that can read files and run shell commands):");
console.log('  "Make a 60s vertical promo about <topic> and export subtitles"');
console.log('  "Mount my content pack at <path> and render the master"');
console.log(`  Or point an agent directly at: ${path.join(SOURCE, "SKILL.md").replace(/\\/g, "/")}`);
