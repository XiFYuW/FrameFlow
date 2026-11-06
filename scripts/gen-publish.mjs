// Generate publish copy (title candidates, body, hashtags, call to action).
// Uses an episode profile when available, otherwise drafts from the timeline.
// All localized wording lives in content/presets/labels.json.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { loadTimeline } from "./export-subtitles.mjs";

const LABELS = JSON.parse(
  readFileSync(new URL("../content/presets/labels.json", import.meta.url), "utf8")
);
const P = LABELS.publish;
const tpl = (text, vars) =>
  text.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] === undefined ? "" : String(vars[key])
  );

/** Draft publish copy directly from the episode timeline. */
function autoDraft(mod, opts = {}) {
  const segments = mod.segments || [];
  const cues = mod.cues || [];
  const emSet = new Set();
  segments.forEach((s) =>
    s.lines.forEach((l) => (l.em || []).forEach((e) => emSet.add(e)))
  );
  const keywords = [...emSet].slice(0, 6);
  const firstLine = cues[0]?.text || "";
  const lastLine = cues[cues.length - 1]?.text || "";
  const chapters = segments.map((s) => s.chapter);
  const series = opts.series || P.fallbacks.series;
  const D = P.draft;

  const titles = [
    tpl(D.titleFirstLine, { firstLine, series }),
    tpl(D.titleFromChapter, {
      series,
      chapter: chapters[1] || P.fallbacks.chapter,
    }),
    tpl(D.titleQuestion, { keyword: keywords[0] || P.fallbacks.keyword }),
  ];
  const content = tpl(D.content, {
    firstLine,
    series,
    chapters: chapters.join(D.chapterSeparator),
    lastLine,
  });
  const hashtags = [
    ...D.hashtags,
    ...keywords.map((k) => `#${k}`),
  ].slice(0, 12);
  return { series, titles, content, hashtags, cta: D.cta };
}

export async function generatePublish(mod, profile = {}, opts = {}) {
  const draft = autoDraft(mod, opts);
  // Episode configs wrap publish data under "publish"; plain profiles are
  // still accepted for backwards compatibility.
  const pub = profile.publish || profile;
  const data = {
    series: pub.series || draft.series,
    episodeTitle: pub.episodeTitle || opts.series || P.fallbacks.episodeTitle,
    titles: pub.titles || draft.titles,
    content: pub.content || draft.content,
    hashtags: pub.hashtags || draft.hashtags,
    cta: pub.cta || draft.cta,
  };
  data.titleWarnings = data.titles
    .map((t) =>
      t.length > P.maxTitle
        ? tpl(P.titleWarning, { limit: P.maxTitle, length: t.length })
        : null
    )
    .filter(Boolean);
  return data;
}

export function formatPublishText(data) {
  const H = P.headings;
  const out = [
    tpl(P.header, { title: data.episodeTitle }),
    "=".repeat(P.dividerWidth),
    "",
    H.titles,
  ];
  data.titles.forEach((t, i) => out.push(`${i + 1}. ${t}`));
  if (data.titleWarnings && data.titleWarnings.length) {
    out.push("", data.titleWarnings.join("\n"));
  }
  out.push("", H.content, data.content, "", H.hashtags, data.hashtags.join(" "));
  out.push("", H.cta, data.cta, "", H.copy, data.titles[0], "");
  out.push(data.content, "", data.hashtags.join(" "));
  return out.join("\n");
}

// CLI: node scripts/gen-publish.mjs --src src/timeline.ts --profile content/episode.json --out out/demo-publish.txt
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const get = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const src = get("--src") || "src/timeline.ts";
  const profilePath = get("--profile") || "content/episode.json";
  const outPath = get("--out");
  const series = get("--series");
  const mod = await loadTimeline(src);
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  const data = await generatePublish(mod, profile, { series });
  const text = formatPublishText(data);
  if (outPath) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
    writeFileSync(outPath.replace(/\.txt$/, ".json"), JSON.stringify(data, null, 2));
    console.log("wrote", outPath);
  } else {
    console.log(text);
  }
}
