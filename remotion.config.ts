import { Config } from "@remotion/cli/config";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir, platform } from "node:os";

/**
 * Browser discovery is OS-agnostic. An explicit override wins; otherwise we
 * probe the conventional install locations of the host platform and then PATH.
 * When nothing usable exists we deliberately do NOT call setBrowserExecutable:
 * Remotion then downloads its own Chrome Headless Shell, which works on every
 * platform (including headless CI) without a system browser installed.
 *
 * resolveBrowser is exported as a pure function so the win32/darwin/linux
 * branches can be tested from any host OS.
 */

type Env = Record<string, string | undefined>;

export type BrowserDiscovery = {
  browser?: string;
  source?: "bundled" | `env:${string}` | `platform:${string}` | "path";
  ignored?: string[];
};

const WINDOWS_APPS = [
  "Google/Chrome/Application/chrome.exe",
  "Google/Chrome Beta/Application/chrome.exe",
  "Google/Chrome SxS/Application/chrome.exe",
  "Microsoft/Edge/Application/msedge.exe",
  "Microsoft/Edge Beta/Application/msedge.exe",
  "Chromium/Application/chrome.exe",
  "BraveSoftware/Brave-Browser/Application/brave.exe",
];

const MAC_APPS = [
  "Google Chrome.app/Contents/MacOS/Google Chrome",
  "Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "Chromium.app/Contents/MacOS/Chromium",
  "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "Brave Browser.app/Contents/MacOS/Brave Browser",
];

const POSIX_BINARIES = [
  "google-chrome-stable",
  "google-chrome",
  "microsoft-edge-stable",
  "microsoft-edge",
  "brave-browser",
  "chromium",
  "chromium-browser",
  "chrome",
];

const UNIX_ABSOLUTE = [
  "/opt/google/chrome/chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/microsoft-edge-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/lib/chromium/chromium",
  "/usr/lib/chromium-browser/chromium-browser",
  "/usr/bin/brave-browser",
  "/snap/bin/chromium",
];

const HOMEBREW_ABSOLUTE = ["/opt/homebrew/bin/chromium", "/usr/local/bin/chromium"];

const MODE_VALUES = ["auto", "bundled", "none", "off", "false", "0"];
const BUNDLED_VALUES = ["bundled", "none", "off", "false", "0"];

const envValue = (env: Env, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = env[key];
    if (value) return value;
  }
  return undefined;
};

const isExecutableFile = (candidate: string, onWindows: boolean): boolean => {
  try {
    // statSync follows symlinks, which is how /usr/bin/chromium is installed
    // on most Linux distributions.
    if (!statSync(candidate).isFile()) return false;
    // X_OK is not meaningful for .exe files on Windows.
    if (onWindows) return true;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const firstMatch = (
  candidates: string[],
  onWindows: boolean,
  check: (candidate: string, onWindows: boolean) => boolean,
): string | undefined =>
  candidates.find((candidate) => Boolean(candidate) && check(candidate, onWindows));

export const resolveBrowser = (options: {
  platform: string;
  env: Env;
  home: string;
  /** Injectable for tests: lets non-host platforms be simulated offline. */
  isExecutableFile?: (candidate: string, onWindows: boolean) => boolean;
}): BrowserDiscovery => {
  const { platform: os, env, home } = options;
  const usable = options.isExecutableFile ?? isExecutableFile;
  const onWindows = os === "win32";
  const mode = (env.FRAMEFLOW_BROWSER ?? "auto").toLowerCase();

  // Opt out of system browsers entirely (useful when a system Chrome version
  // is incompatible, or to make CI behaviour deterministic).
  if (BUNDLED_VALUES.includes(mode)) return { source: "bundled" };

  // 1. Explicit overrides, in priority order. A non-mode FRAMEFLOW_BROWSER
  // value is treated as a path as well.
  const overrides: Array<[string, string | undefined]> = [
    ["REMOTION_BROWSER", env.REMOTION_BROWSER],
    ["FRAMEFLOW_BROWSER", MODE_VALUES.includes(mode) ? undefined : env.FRAMEFLOW_BROWSER],
    ["CHROME_PATH", env.CHROME_PATH],
    ["PUPPETEER_EXECUTABLE_PATH", env.PUPPETEER_EXECUTABLE_PATH],
    ["CHROME_BIN", env.CHROME_BIN],
  ];
  const ignored: string[] = [];
  for (const [key, value] of overrides) {
    if (!value) continue;
    if (usable(value, onWindows)) return { browser: value, source: `env:${key}`, ignored };
    ignored.push(`${key}=${value}`);
  }

  // 2. Conventional install locations for the host OS.
  let candidates: string[] = [];
  if (onWindows) {
    const roots = [
      envValue(env, "ProgramFiles", "PROGRAMFILES") ?? "C:/Program Files",
      envValue(env, "ProgramFiles(x86)", "PROGRAMFILES(X86)") ?? "C:/Program Files (x86)",
      envValue(env, "LOCALAPPDATA", "LocalAppData") ?? join(home, "AppData", "Local"),
    ];
    candidates = roots.flatMap((root) => WINDOWS_APPS.map((app) => join(root, app)));
  } else if (os === "darwin") {
    candidates = [
      ...["/Applications", join(home, "Applications")].flatMap((root) =>
        MAC_APPS.map((app) => join(root, app)),
      ),
      ...HOMEBREW_ABSOLUTE,
    ];
  } else {
    candidates = [...UNIX_ABSOLUTE, ...HOMEBREW_ABSOLUTE];
  }

  const fromPlatform = firstMatch(candidates, onWindows, usable);
  if (fromPlatform) return { browser: fromPlatform, source: `platform:${os}`, ignored };

  // 3. PATH lookup: the reliable route on Linux/BSD and for Homebrew/Snap.
  const pathDirs = envValue(env, "PATH", "Path")?.split(delimiter).filter(Boolean) ?? [];
  const fromPath = firstMatch(
    pathDirs.flatMap((dir) =>
      POSIX_BINARIES.map((name) => join(dir, onWindows ? `${name}.exe` : name)),
    ),
    onWindows,
    usable,
  );
  if (fromPath) return { browser: fromPath, source: "path", ignored };

  // 4. Let Remotion download and manage Chrome Headless Shell.
  return { source: "bundled", ignored };
};

const discovery = resolveBrowser({
  platform: platform(),
  env: process.env,
  home: homedir(),
});

if (discovery.ignored?.length) {
  console.warn(
    `[frameflow] Ignoring browser override(s) that do not point to an executable file: ${discovery.ignored.join(", ")}`,
  );
}
if (discovery.browser) Config.setBrowserExecutable(discovery.browser);
if (process.env.FRAMEFLOW_BROWSER_DEBUG) {
  console.log(`[frameflow] browser: ${discovery.browser ?? "Remotion bundled"} (${discovery.source})`);
}

Config.setOverwriteOutput(true);

// JPEG frames render faster and keep the intermediate payload small.
Config.setVideoImageFormat("jpeg");

// Concurrency and output quality. FRAMEFLOW_CONCURRENCY lets containers and
// low-core CI runners tune this without editing the config.
const requestedConcurrency = Number(process.env.FRAMEFLOW_CONCURRENCY);
Config.setConcurrency(
  Number.isInteger(requestedConcurrency) && requestedConcurrency > 0 ? requestedConcurrency : 4,
);
Config.setCrf(18);
Config.setImageSequence(false);
