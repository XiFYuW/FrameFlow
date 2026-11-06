import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Audio,
  staticFile,
  Img,
  delayRender,
  continueRender,
} from "remotion";
import {
  cues,
  segments,
  FPS,
  BEAT_FRAMES,
  formatTimecode,
} from "./timeline";
import { FONT_FAMILY, waitForFont } from "./font";
import { AUDIO, FEATURES, episode, renderPreset, Season } from "./episode";

// Deep indigo palette with a classical gold accent.
const ACCENT = "#e9c46a";
const ACCENT_SOFT = "rgba(233,196,106,0.9)";
const VERMILION = "#c0392b";

// Optional decorative fields. A content pack can omit all of them.
const SEAL_CHAR = episode.seal ?? "";
const SEASON = episode.season;

/** Beat pulse: peaks at 1 on the beat, decays to 0. */
const beatPulse = (frame: number): number => {
  const phase = (frame % BEAT_FRAMES) / BEAT_FRAMES; // 0..1
  return Math.pow(1 - phase, 2.2);
};

// ===== Scene illustrations =====
interface SceneDef {
  start: number;
  end: number;
  img: string;
  /** Ken Burns start/end zoom */
  z0: number;
  z1: number;
  /** Ken Burns x/y translation in pixels */
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
}

// Scene timing and Ken Burns parameters are shared presets; only the
// illustration directory varies per episode.
const SCENES: SceneDef[] = renderPreset.scenes.map((s, i) => ({
  start: s.start,
  end: s.end,
  img: `${episode.illustrationsDir}/${renderPreset.sceneFilePattern.replace("{n}", String(i + 1))}`,
  z0: s.z0,
  z1: s.z1,
  tx0: s.tx0,
  tx1: s.tx1,
  ty0: s.ty0,
  ty1: s.ty1,
}));

// Transition types rotate across scene boundaries; list length is free.
type TransitionType =
  | "fade"
  | "slideLeft"
  | "slideUp"
  | "zoom"
  | "wipeDown"
  | "iris"
  | "slideRight"
  | "slideDown"
  | "flip"
  | "shutter"
  | "circleWipe"
  | "blur";
const TRANSITIONS = (renderPreset.transitions.length
  ? renderPreset.transitions
  : ["fade"]) as TransitionType[];

const CROSSFADE_FRAMES = renderPreset.crossfadeFrames;

/** Transition style at progress p (0..1) for the incoming or outgoing layer. */
function tStyle(type: TransitionType, p: number, dir: "in" | "out") {
  const e = dir === "in";
  switch (type) {
    case "fade":
      return { opacity: e ? p : 1 - p };
    case "slideLeft": {
      const shift = (1 - p) * 1920;
      return { transform: `translateX(${e ? shift : -shift}px)` };
    }
    case "slideUp": {
      const shift = (1 - p) * 1080;
      return { transform: `translateY(${e ? shift : -shift}px)` };
    }
    case "slideRight": {
      const shift = (1 - p) * 1920;
      return { transform: `translateX(${e ? -shift : shift}px)` };
    }
    case "slideDown": {
      const shift = (1 - p) * 1080;
      return { transform: `translateY(${e ? -shift : shift}px)` };
    }
    case "zoom": {
      if (e) return { transform: `scale(${1.18 - 0.18 * p})` };
      return { transform: `scale(${1 + 0.12 * p})`, opacity: 1 - p };
    }
    case "flip": {
      const ang = e ? (1 - p) * 75 : -p * 75;
      return {
        transform: `perspective(1600px) rotateY(${ang}deg)`,
        opacity: e ? p : 1 - p,
      };
    }
    case "wipeDown": {
      if (e) return { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` };
      return { opacity: 1 - p };
    }
    case "shutter": {
      // Shutter opening outwards from the horizontal center line.
      if (e) return { clipPath: `inset(0 ${(1 - p) * 50}% ${(1 - p) * 50}% 0)` };
      return { opacity: 1 - p };
    }
    case "circleWipe": {
      // Circular wipe expanding from the top-right corner.
      if (e) return { clipPath: `circle(${p * 150}% at 88% 12%)` };
      return { opacity: 1 - p };
    }
    case "blur": {
      if (e) return { opacity: p, filter: `blur(${(1 - p) * 14}px)` };
      return { opacity: 1 - p, filter: `blur(${p * 14}px)` };
    }
    case "iris": {
      if (e) return { clipPath: `circle(${p * 150}% at 50% 50%)` };
      return { opacity: 1 - p };
    }
  }
  return {};
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
}

/** Scene layer: Ken Burns motion plus transition transform/clip on the wrapper. */
const SceneLayer: React.FC<{
  scene: SceneDef;
  opacity: number;
  transform?: string;
  clipPath?: string;
  filter?: string;
}> = ({ scene, opacity, transform, clipPath, filter }) => {
  const frame = useCurrentFrame();
  const rel = Math.max(0, frame - scene.start);
  const dur = scene.end - scene.start;
  const p = dur > 0 ? rel / dur : 0;

  const scale = interpolate(p, [0, 1], [scene.z0, scene.z1]);
  const tx = interpolate(p, [0, 1], [scene.tx0, scene.tx1]);
  const ty = interpolate(p, [0, 1], [scene.ty0, scene.ty1]);

  return (
    <AbsoluteFill
      style={{
        opacity,
        overflow: "hidden",
        transform: transform ?? "none",
        clipPath: clipPath ?? "none",
        filter: filter ?? "none",
      }}
    >
      <Img
        src={staticFile(`illustrations/${scene.img}`)}
        style={{
          position: "absolute",
          width: "116%",
          height: "116%",
          left: "-8%",
          top: "-8%",
          objectFit: "cover",
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        }}
      />
    </AbsoluteFill>
  );
};

const Scenes: React.FC = () => {
  const frame = useCurrentFrame();

  // Resolve the active scene index.
  let idx = SCENES.findIndex((s) => frame >= s.start && frame < s.end);
  if (idx < 0) {
    idx = frame < SCENES[0].start ? 0 : SCENES.length - 1;
  }
  const current = SCENES[idx];
  const next = SCENES[idx + 1];

  const isTrans =
    next && frame >= current.end - CROSSFADE_FRAMES && frame < current.end;
  const p = isTrans
    ? (frame - (current.end - CROSSFADE_FRAMES)) / CROSSFADE_FRAMES
    : 1;
  const type = TRANSITIONS[idx % TRANSITIONS.length];

  const outSt = isTrans ? tStyle(type, p, "out") : { opacity: 1 };
  const inSt = isTrans ? tStyle(type, p, "in") : null;

  return (
    <AbsoluteFill style={{ zIndex: 0 }}>
      <SceneLayer
        scene={current}
        opacity={outSt.opacity ?? 1}
        transform={outSt.transform}
        clipPath={outSt.clipPath}
        filter={outSt.filter as string | undefined}
      />
      {isTrans && next && (
        <SceneLayer
          scene={next}
          opacity={inSt!.opacity ?? 1}
          transform={inSt!.transform}
          clipPath={inSt!.clipPath}
          filter={inSt!.filter as string | undefined}
        />
      )}

      {/* Light band sweeping across the screen during a transition */}
      {isTrans && (
        <AbsoluteFill style={{ pointerEvents: "none", zIndex: 4 }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: `${p * 100}%`,
              width: 10,
              height: "100%",
              transform: "translateX(-50%)",
              background:
                "linear-gradient(90deg, transparent, rgba(233,196,106,0.95), transparent)",
              opacity: 0.6 * (1 - Math.abs(p - 0.5) * 2),
              filter: "blur(4px)",
            }}
          />
        </AbsoluteFill>
      )}

      {/* Vignette and readability scrims */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 40%, transparent 0%, rgba(8,10,22,0.35) 55%, rgba(8,10,22,0.72) 100%)",
          mixBlendMode: "multiply",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(8,10,22,0.45) 0%, transparent 22%, transparent 55%, rgba(8,10,22,0.82) 88%, rgba(8,10,22,0.95) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// ===== Particles =====
function makeParticles(n: number) {
  let seed = 20261004;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: n }, () => ({
    x: rnd() * 1920,
    y: rnd() * 1080,
    r: 1.2 + rnd() * 3.2,
    sx: (rnd() - 0.5) * 36,
    sy: (rnd() - 0.5) * 36,
    phase: rnd() * Math.PI * 2,
    speed: 0.18 + rnd() * 0.5,
    alpha: 0.08 + rnd() * 0.3,
  }));
}
const PARTICLES = makeParticles(54);

const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {PARTICLES.map((p, i) => {
        let y = p.y - ((frame * 0.25 * p.speed) % 1080);
        if (y < 0) y += 1080;
        const x = p.x + Math.sin(t * p.speed + p.phase) * p.sx;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.r * 2,
              height: p.r * 2,
              borderRadius: "50%",
              background: i % 3 === 0 ? ACCENT_SOFT : "rgba(255,255,255,0.8)",
              opacity: p.alpha,
              filter: "blur(0.5px)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Gradient backdrop with a beat-reactive glow. */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pulse = beatPulse(frame);
  const t = frame / durationInFrames;

  const glowX = interpolate(Math.sin(t * Math.PI * 2), [-1, 1], [220, 1700]);
  const glowY = interpolate(Math.cos(t * Math.PI * 1.5), [-1, 1], [220, 860]);
  const hueA = interpolate(frame, [0, durationInFrames], [232, 268]);
  const hueB = interpolate(frame, [0, durationInFrames], [262, 224]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, hsl(${hueA}, 55%, 9%) 0%, hsl(${hueB}, 52%, 14%) 55%, #0a0a14 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(${620 + pulse * 160}px ${620 + pulse * 160}px at ${glowX}px ${glowY}px, rgba(130,130,255,${0.16 + pulse * 0.14}), transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};

/** Large watermark character: slow rotation with beat-driven scale. */
const Watermark: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = beatPulse(frame);
  const rotate = interpolate(frame, [0, 600], [0, 22], { extrapolateRight: "extend" });
  const scale = 1 + Math.sin(frame / 90) * 0.02 + pulse * 0.03;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 940,
          fontWeight: 900,
          color: "rgba(255,255,255,0.04)",
          transform: `rotate(${rotate}deg) scale(${scale})`,
          userSelect: "none",
        }}
      >
        {SEAL_CHAR}
      </div>
    </AbsoluteFill>
  );
};

/** Taiji mark: continuous rotation with beat-driven scale. */
const Taiji: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = beatPulse(frame);
  const rotate = (frame / FPS) * 18;
  const scale = 1 + pulse * 0.08;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 70, paddingRight: 70, pointerEvents: "none" }}>
      <svg width={96} height={96} viewBox="0 0 100 100" style={{ transform: `rotate(${rotate}deg) scale(${scale})`, opacity: 0.22 }}>
        <circle cx="50" cy="50" r="48" fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <path d="M50 2 a24 24 0 0 1 0 48 a24 24 0 0 0 0 48 a48 48 0 0 1 0 -96 z" fill={ACCENT} />
        <circle cx="50" cy="26" r="8" fill="#0b1026" />
        <circle cx="50" cy="74" r="8" fill={ACCENT} />
      </svg>
    </AbsoluteFill>
  );
};

/** Summer motif: warm green pond mist and drifting firefly-like sparks.
 *  Shared by the six summer episodes. */
const SummerMotif: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = beatPulse(frame);
  const t = frame / FPS;

  // 16 warm sparks drifting upward with a beat-synced twinkle.
  const makeSpark = (i: number) => {
    const seed = i * 131 + 7;
    const rnd = (n: number) => {
      const v = Math.sin(seed * (n + 1)) * 43758.5453;
      return v - Math.floor(v);
    };
    const x0 = rnd(1) * 1920;
    const speed = 0.18 + rnd(2) * 0.4;
    const drift = rnd(3) * 180 - 90;
    const size = 6 + rnd(4) * 10;
    const span = 1080;
    const y = ((frame * 0.32 * speed + rnd(5) * span) % span) - 60;
    const x = x0 + Math.sin(t * speed + i) * drift;
    const twinkle = 0.5 + 0.5 * Math.sin(t * (1.2 + rnd(6)) + i);
    return { x, y, size, twinkle, warm: i % 2 === 0 };
  };
  const SPARKS = Array.from({ length: 16 }, (_, i) => makeSpark(i));

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 3,
        mixBlendMode: "screen",
      }}
    >
      {/* Warm green mist along the bottom edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          height: 560,
          background:
            "linear-gradient(0deg, rgba(108,178,120,0.32) 0%, rgba(120,200,150,0.12) 45%, transparent 100%)",
          opacity: 0.7 + pulse * 0.2,
        }}
      />
      {/* Drifting warm sparks */}
      {SPARKS.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: s.warm
              ? "rgba(255,221,128,0.9)"
              : "rgba(255,246,200,0.7)",
            boxShadow: `0 0 ${6 + s.twinkle * 10}px rgba(255,221,128,0.8)`,
            opacity: (0.25 + s.twinkle * 0.55) * (0.7 + pulse * 0.3),
            filter: "blur(0.6px)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Autumn motif: swirling leaves, warm haze and golden specks. Shared by the six autumn episodes. */
const AutumnMotif: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = beatPulse(frame);
  const t = frame / FPS;

  // 18 leaves falling with sway and rotation.
  const makeLeaf = (i: number) => {
    const seed = i * 97 + 31;
    const rnd = (n: number) => {
      const v = Math.sin(seed * (n + 1)) * 43758.5453;
      return v - Math.floor(v);
    };
    const x0 = rnd(1) * 1920;
    const span = 1200;
    const speed = 0.5 + rnd(2) * 0.9;
    const y = ((frame * 1.1 * speed + rnd(3) * span) % span) - 60;
    const sway = Math.sin(t * (0.6 + rnd(4)) + i) * (60 + rnd(5) * 120);
    const x = x0 + sway;
    const rot = (frame * (0.4 + rnd(6) * 0.8) + i * 50) % 360;
    const size = 14 + rnd(7) * 18;
    const kind = i % 3; // 0 red maple, 1 golden, 2 orange
    const color = kind === 0 ? "rgba(200,70,50,0.92)" : kind === 1 ? "rgba(230,180,70,0.9)" : "rgba(220,130,40,0.9)";
    return { x, y, rot, size, color };
  };
  const LEAVES = Array.from({ length: 18 }, (_, i) => makeLeaf(i));

  // Warm golden specks
  const makeDot = (i: number) => {
    const seed = i * 53 + 17;
    const rnd = (n: number) => {
      const v = Math.sin(seed * (n + 1)) * 43758.5453;
      return v - Math.floor(v);
    };
    const x0 = rnd(1) * 1920;
    const speed = 0.2 + rnd(2) * 0.5;
    const y = ((frame * 0.4 * speed + rnd(3) * 1080) % 1080) - 40;
    const x = x0 + Math.sin(t * speed + i) * 60;
    const tw = 0.5 + 0.5 * Math.sin(t * (1 + rnd(4)) + i);
    const size = 3 + rnd(5) * 4;
    return { x, y, tw, size };
  };
  const DOTS = Array.from({ length: 14 }, (_, i) => makeDot(i));

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 3, mixBlendMode: "screen" }}>
      {/* Warm harvest haze */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(60% 50% at 50% 18%, rgba(255,180,90,0.16), transparent 70%)", opacity: 0.7 + pulse * 0.2 }} />
      {/* Swirling leaves */}
      {LEAVES.map((l, i) => (
        <div key={`l${i}`} style={{ position: "absolute", left: l.x, top: l.y, width: l.size, height: l.size * 0.7, background: l.color, borderRadius: "0 60% 0 60%", transform: `rotate(${l.rot}deg)`, opacity: 0.55 + pulse * 0.25, filter: "blur(0.4px)", boxShadow: `0 0 8px ${l.color}` }} />
      ))}
      {/* Golden specks */}
      {DOTS.map((d, i) => (
        <div key={`d${i}`} style={{ position: "absolute", left: d.x, top: d.y, width: d.size, height: d.size, borderRadius: "50%", background: "rgba(255,210,120,0.95)", boxShadow: `0 0 ${4 + d.tw * 8}px rgba(255,200,100,0.8)`, opacity: 0.3 + d.tw * 0.5 }} />
      ))}
    </AbsoluteFill>
  );
};

/** Winter motif: falling snow, warm hearth lights and cool blue mist. Shared by the six winter episodes. */
const WinterMotif: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = beatPulse(frame);
  const t = frame / FPS;

  // 22 snowflakes falling with a gentle horizontal sway.
  const makeSnow = (i: number) => {
    const seed = i * 71 + 23;
    const rnd = (n: number) => {
      const v = Math.sin(seed * (n + 1)) * 43758.5453;
      return v - Math.floor(v);
    };
    const x0 = rnd(1) * 1920;
    const span = 1160;
    const speed = 0.4 + rnd(2) * 0.7;
    const y = ((frame * 0.9 * speed + rnd(3) * span) % span) - 40;
    const x = x0 + Math.sin(t * (0.5 + rnd(4)) + i) * (30 + rnd(5) * 70);
    const size = 4 + rnd(6) * 9;
    const alpha = 0.4 + rnd(7) * 0.5;
    return { x, y, size, alpha };
  };
  const SNOW = Array.from({ length: 22 }, (_, i) => makeSnow(i));

  // Warm indoor light specks
  const makeWarm = (i: number) => {
    const seed = i * 41 + 11;
    const rnd = (n: number) => {
      const v = Math.sin(seed * (n + 1)) * 43758.5453;
      return v - Math.floor(v);
    };
    const x0 = rnd(1) * 1920;
    const y0 = 600 + rnd(2) * 420;
    const speed = 0.15 + rnd(3) * 0.3;
    const x = x0 + Math.sin(t * speed + i) * 50;
    const y = y0 + Math.cos(t * speed + i) * 20;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + rnd(4)) + i);
    const size = 6 + rnd(5) * 8;
    return { x, y, tw, size };
  };
  const WARMS = Array.from({ length: 12 }, (_, i) => makeWarm(i));

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 3, mixBlendMode: "screen" }}>
      {/* Cool blue mist */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 60% at 50% 100%, rgba(180,210,255,0.16), transparent 70%)", opacity: 0.6 + pulse * 0.2 }} />
      {/* Falling snow */}
      {SNOW.map((s, i) => (
        <div key={`s${i}`} style={{ position: "absolute", left: s.x, top: s.y, width: s.size, height: s.size, borderRadius: "50%", background: "rgba(255,255,255,0.95)", opacity: s.alpha, filter: "blur(0.4px)", boxShadow: "0 0 6px rgba(200,220,255,0.7)" }} />
      ))}
      {/* Hearth lights */}
      {WARMS.map((w, i) => (
        <div key={`w${i}`} style={{ position: "absolute", left: w.x, top: w.y, width: w.size, height: w.size, borderRadius: "50%", background: "rgba(255,170,90,0.95)", boxShadow: `0 0 ${8 + w.tw * 14}px rgba(255,150,70,0.85)`, opacity: 0.35 + w.tw * 0.55 }} />
      ))}
    </AbsoluteFill>
  );
};

/** Top-left brand mark */
const BrandMark: React.FC = () => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", paddingTop: 62, paddingLeft: 70, pointerEvents: "none" }}>
    <div style={{ fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: 700, letterSpacing: 6, color: ACCENT_SOFT, textShadow: "0 2px 14px rgba(0,0,0,0.5)" }}>{renderPreset.brandTitle}</div>
    <div style={{ fontFamily: FONT_FAMILY, fontSize: 14, letterSpacing: 3, color: "rgba(255,255,255,0.55)", marginTop: 6, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
      {episode.brandSubtitle}
    </div>
  </AbsoluteFill>
);

/** Persistent chapter label with a spring entrance and an accent bar. */
const ChapterLabel: React.FC<{ chapter: string; index: number }> = ({ chapter, index }) => {
  const frame = useCurrentFrame();
  const seg = segments[index - 1];
  const segStart = seg.startSec * FPS;

  const fadeIn = interpolate(frame, [segStart, segStart + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [seg.endSec * FPS - 24, seg.endSec * FPS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Hide the label while the chapter splash is visible.
  const dt = frame - segStart;
  const splashActive = index > 1 && dt >= 0 && dt <= 54;
  const opacity = splashActive ? 0 : Math.min(fadeIn, fadeOut);

  const enter = spring({
    frame: Math.max(frame - segStart, 0),
    fps: FPS,
    config: { damping: 14, stiffness: 120, mass: 0.9 },
  });
  const y = interpolate(enter, [0, 1], [-40, 0]);
  const bar = spring({ frame: Math.max(frame - segStart - 6, 0), fps: FPS, config: { damping: 16, stiffness: 140 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 152, pointerEvents: "none" }}>
      <div style={{ opacity, transform: `translateY(${y}px)` }}>
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 20, letterSpacing: 8, color: ACCENT_SOFT, textAlign: "center", textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
          {renderPreset.chapterPrefix} {renderPreset.chapterNumerals[index - 1] ?? index} {renderPreset.chapterSuffix}
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 40, fontWeight: 700, letterSpacing: 4, color: "#fff", textAlign: "center", marginTop: 10, textShadow: "0 4px 20px rgba(0,0,0,0.55)" }}>
          {chapter}
        </div>
        <div style={{ width: 64, height: 3, background: ACCENT, margin: "16px auto 0", borderRadius: 2, transform: `scaleX(${bar})`, transformOrigin: "center", boxShadow: `0 0 12px ${ACCENT}` }} />
      </div>
    </AbsoluteFill>
  );
};

/** Full-screen chapter splash shown at the start of every chapter. */
const ChapterSplash: React.FC = () => {
  const frame = useCurrentFrame();
  const segIdx = segments.findIndex(
    (s) => frame >= s.startSec * FPS && frame < s.endSec * FPS
  );
  if (segIdx <= 0) return null;
  const st = segments[segIdx].startSec * FPS;
  const dt = frame - st;
  if (dt < 0 || dt > 54) return null;

  const seg = segments[segIdx];
  const enter = spring({
    frame: dt,
    fps: FPS,
    config: { damping: 13, stiffness: 120 },
  });
  const op = Math.min(
    interpolate(dt, [0, 8], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(dt, [44, 54], [1, 0], { extrapolateLeft: "clamp" })
  );
  const scale = 0.82 + 0.18 * enter;
  const y = interpolate(enter, [0, 1], [44, 0]);
  const numeral = renderPreset.chapterNumerals[segIdx - 1];

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 6,
      }}
    >
      <div
        style={{
          opacity: op,
          transform: `translateY(${y}px) scale(${scale})`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 26,
            letterSpacing: 16,
            color: ACCENT,
            marginBottom: 16,
          }}
        >
          {renderPreset.chapterPrefix} {numeral} {renderPreset.chapterSuffix}
        </div>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 86,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: 6,
            textShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        >
          {seg.chapter}
        </div>
        <div
          style={{
            width: 130,
            height: 4,
            background: ACCENT,
            margin: "28px auto 0",
            borderRadius: 2,
            transform: `scaleX(${enter})`,
            boxShadow: `0 0 22px ${ACCENT}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/** Vermilion seal that stamps in when a tagged cue appears. */
const SealStamp: React.FC<{ start: number; end: number }> = ({ start, end }) => {
  const frame = useCurrentFrame();
  const dt = frame - start;
  const s = spring({
    frame: Math.max(dt, 0),
    fps: FPS,
    config: { damping: 11, stiffness: 150, mass: 0.7 },
  });
  const scale = interpolate(s, [0, 1], [0.3, 1]);
  const rot = interpolate(s, [0, 1], [-38, -6]);
  const inOp = interpolate(dt, [0, 5], [0, 1], { extrapolateRight: "clamp" });
  const outOp = interpolate(end - frame, [0, 6], [0, 1], { extrapolateLeft: "clamp" });
  const op = Math.min(inOp, outOp);
  return (
    <div
      style={{
        position: "absolute",
        top: -36,
        left: -36,
        width: 104,
        height: 104,
        opacity: op,
        transform: `translateY(${-(1 - s) * 18}px) scale(${scale}) rotate(${rot}deg)`,
        pointerEvents: "none",
        filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
      }}
    >
      <svg width={104} height={104} viewBox="0 0 100 100">
        <rect x="6" y="6" width="88" height="88" rx="14" fill="rgba(192,57,43,0.14)" stroke={VERMILION} strokeWidth="5" />
        <text x="50" y="54" textAnchor="middle" dominantBaseline="central"
          fontFamily="serif" fontSize="54" fontWeight="900" fill={VERMILION}>{SEAL_CHAR}</text>
      </svg>
    </div>
  );
};

/** Quote card sliding in from the right with a gentle float. */
const QuoteCard: React.FC = () => {
  const frame = useCurrentFrame();
  const seg = segments.find(
    (s) => frame >= s.startSec * FPS && frame < s.endSec * FPS
  );
  if (!seg || !seg.quote) return null;
  const st = seg.startSec * FPS;
  const en = seg.endSec * FPS;
  const dt = frame - st;
  const edt = en - frame;

  const enter = spring({
    frame: Math.max(dt, 0),
    fps: FPS,
    config: { damping: 18, stiffness: 110, mass: 0.9 },
  });
  const inX = interpolate(enter, [0, 1], [320, 0]);
  const inOp = interpolate(dt, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const outOp = interpolate(edt, [0, 22], [0, 1], { extrapolateLeft: "clamp" });
  const op = Math.min(inOp, outOp);
  const bob = Math.sin(frame / 42) * 7;
  const pulse = beatPulse(frame);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: 96,
        paddingBottom: 40,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          opacity: op,
          transform: `translateX(${inX}px) translateY(${bob}px) scale(${1 + pulse * 0.02})`,
          width: 384,
          background: "linear-gradient(160deg, rgba(20,16,30,0.84), rgba(10,8,18,0.92))",
          border: "1px solid rgba(233,196,106,0.45)",
          borderLeft: `4px solid ${ACCENT}`,
          borderRadius: 18,
          padding: "26px 28px",
          boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 16, letterSpacing: 4, color: ACCENT, marginBottom: 14 }}>
          {seg.quote.src ?? renderPreset.quoteFallback}
        </div>
        <div style={{ fontFamily: FONT_FAMILY, fontSize: 30, fontWeight: 600, lineHeight: 1.62, color: "#fff", letterSpacing: 2 }}>
          {seg.quote.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Split text into characters and flag the highlighted keywords. */
function splitHighlight(text: string, em?: string[]): { ch: string; hl: boolean }[] {
  if (!em || em.length === 0) {
    return text.split("").map((ch) => ({ ch, hl: false }));
  }
  const hl = new Array(text.length).fill(false);
  for (const phrase of em) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(phrase, from);
      if (idx < 0) break;
      for (let k = 0; k < phrase.length; k++) hl[idx + k] = true;
      from = idx + phrase.length;
    }
  }
  return text.split("").map((ch, i) => ({ ch, hl: hl[i] }));
}

/** Bottom subtitle card: keyword highlight, per-character stagger, seal stamp and brush underline. */
const Subtitle: React.FC = () => {
  const frame = useCurrentFrame();
  const last = cues[cues.length - 1];
  const found = cues.find((c) => frame >= c.start && frame < c.end);
  const cue = found ?? (frame >= last.end ? last : cues[0]);
  const hold = !found && frame >= last.end;

  const rel = frame - cue.start;
  const appear = interpolate(rel, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [cue.end - 10, cue.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cardOpacity = hold ? 1 : Math.min(appear, exit);

  const chars = splitHighlight(cue.text, cue.em);
  // Derive the stagger from cue duration so the full line lands in the first half.
  const cueDur = cue.end - cue.start;
  const charDelay = Math.max(
    0.35,
    Math.min(1.3, (cueDur - 8) / Math.max(chars.length, 1))
  );

  const tagPulse = beatPulse(frame);
  // Brush underline draw progress
  const draw = interpolate(frame, [cue.start, cue.start + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tipPct = draw * 100;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 116, pointerEvents: "none" }}>
      <div style={{ opacity: cardOpacity, maxWidth: 1580, textAlign: "center", position: "relative" }}>
        {FEATURES.sealStamp && cue.tag && <SealStamp start={cue.start} end={cue.end} />}
        {cue.tag && (
          <div
            style={{
              display: "inline-block",
              fontFamily: FONT_FAMILY,
              fontSize: 22,
              letterSpacing: 4,
              color: "#0a0a14",
              background: ACCENT,
              borderRadius: 999,
              padding: "5px 22px",
              marginBottom: 22,
              fontWeight: 700,
              boxShadow: `0 0 ${18 + tagPulse * 16}px ${ACCENT}`,
              transform: `scale(${1 + tagPulse * 0.05})`,
            }}
          >
            {cue.tag}
          </div>
        )}
        <div
          style={{
            background: "linear-gradient(180deg, rgba(12,12,26,0.74), rgba(8,8,18,0.84))",
            border: "1px solid rgba(233,196,106,0.35)",
            borderRadius: 28,
            padding: "28px 54px",
            boxShadow: "0 22px 70px rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILY,
              fontSize: 60,
              fontWeight: 500,
              lineHeight: 1.42,
              letterSpacing: 3,
            }}
          >
            {chars.map((c, i) => {
              const cs = cue.start + i * charDelay;
              const o = interpolate(frame, [cs, cs + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              const y = interpolate(frame, [cs, cs + 6], [22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: o,
                    transform: `translateY(${y}px)`,
                    color: c.hl ? ACCENT : "#ffffff",
                    fontWeight: c.hl ? 800 : 500,
                    textShadow: "0 2px 10px rgba(0,0,0,0.4)",
                  }}
                >
                  {c.ch === " " ? " " : c.ch}
                </span>
              );
            })}
          </div>
          {/* Brush underline with a moving tip */}
          <div style={{ position: "relative", height: 4, width: "100%", marginTop: 18 }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${tipPct}%`,
                background: `linear-gradient(90deg, transparent, ${ACCENT})`,
                borderRadius: 2,
              }}
            />
            {draw < 1 && (
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  left: `calc(${tipPct}% - 7px)`,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: ACCENT,
                  boxShadow: `0 0 14px ${ACCENT}`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Four-dot beat indicator at the bottom */
const BeatIndicator: React.FC = () => {
  const frame = useCurrentFrame();
  const beatInBar = Math.floor(frame / BEAT_FRAMES) % 4;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 54, pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => {
          const active = i === beatInBar;
          const pulse = active ? beatPulse(frame) : 0;
          return (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: active ? ACCENT : "rgba(255,255,255,0.25)",
                opacity: active ? 0.55 + pulse * 0.45 : 0.5,
                transform: `scale(${active ? 1 + pulse * 0.5 : 1})`,
                boxShadow: active ? `0 0 ${8 + pulse * 16}px ${ACCENT}` : "none",
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Progress bar and timecode */
const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const progress = frame / durationInFrames;
  const cur = formatTimecode(frame / fps);
  const total = formatTimecode(durationInFrames / fps);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "stretch", paddingBottom: 0, pointerEvents: "none" }}>
      <div style={{ width: "100%", height: 5, background: "rgba(255,255,255,0.12)" }}>
        <div style={{ width: `${progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, #ffd98a)` }} />
      </div>
      <div style={{ position: "absolute", right: 70, bottom: 22, fontFamily: FONT_FAMILY, fontSize: 18, letterSpacing: 2, color: "rgba(255,255,255,0.65)", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
        {cur} / {total}
      </div>
    </AbsoluteFill>
  );
};

/** Optional ambient motifs, enabled per content pack. */
const MOTIF_BY_SEASON: Partial<Record<Season, React.FC>> = {
  summer: SummerMotif,
  autumn: AutumnMotif,
  winter: WinterMotif,
};

export const FrameFlowVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const Motif = SEASON ? MOTIF_BY_SEASON[SEASON] : undefined;

  // A content pack may supply a font; otherwise the system font is used.
  const [fontHandle] = useState(() => waitForFont());
  useEffect(() => {}, [fontHandle]);

  // Preload all scene illustrations.
  const [imageHandle] = useState(() => delayRender("Preloading scene illustrations"));
  useEffect(() => {
    Promise.all(
      SCENES.map((s) => preloadImage(staticFile(`illustrations/${s.img}`)))
    )
      .then(() => continueRender(imageHandle))
      .catch((err) => {
        console.warn("Scene preload failed, continuing render:", err);
        continueRender(imageHandle);
      });
  }, [imageHandle]);

  const seg =
    segments.find((s) => frame >= s.startSec * FPS && frame < s.endSec * FPS) ??
    segments[segments.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a14", fontFamily: FONT_FAMILY }}>
      {AUDIO && <Audio src={staticFile(AUDIO.src)} volume={AUDIO.volume} />}
      <Background />
      <Scenes />
      {FEATURES.particles && <Particles />}
      {FEATURES.seasonMotif && Motif && <Motif />}
      {FEATURES.watermark && SEAL_CHAR && <Watermark />}
      {FEATURES.taiji && <Taiji />}
      {FEATURES.brandMark && <BrandMark />}
      {FEATURES.chapterLabel && (
        <ChapterLabel chapter={seg.chapter} index={segments.indexOf(seg) + 1} />
      )}
      {FEATURES.chapterSplash && <ChapterSplash />}
      {FEATURES.quoteCard && <QuoteCard />}
      {FEATURES.subtitle && <Subtitle />}
      {FEATURES.beatIndicator && <BeatIndicator />}
      {FEATURES.progressBar && <ProgressBar />}
    </AbsoluteFill>
  );
};
