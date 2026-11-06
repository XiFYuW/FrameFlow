import { delayRender, continueRender, staticFile } from "remotion";
import { renderPreset } from "./episode";

// A content pack may supply a font file. Without one, system fonts are used
// and no render delay is introduced.
const fontConfig = renderPreset.font;

export const FONT_FAMILY =
  fontConfig?.family ?? "system-ui, -apple-system, 'Segoe UI', sans-serif";

let fontLoad: Promise<FontFace> | null = null;

function loadFont(): Promise<FontFace> {
  if (!fontConfig?.file) return Promise.reject(new Error("No font configured"));
  if (!fontLoad) {
    const face = new FontFace(FONT_FAMILY, `url(${staticFile(fontConfig.file)})`, {
      weight: "100 900",
      style: "normal",
      display: "swap",
    });
    fontLoad = face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        return loaded;
      })
      .catch((err) => {
        // A missing font must not block rendering; fall back to system fonts.
        console.warn("Font failed to load, falling back to system fonts:", err);
        throw err;
      });
  }
  return fontLoad;
}

/** Returns null when the content pack supplies no font file. */
export const waitForFont = (): number | null => {
  if (!fontConfig?.file) return null;
  const handle = delayRender("Loading font");
  loadFont()
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
  return handle;
};
