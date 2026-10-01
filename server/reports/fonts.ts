import { readFileSync } from "node:fs";
import { create } from "fontkit";

export const reportFont = readFileSync(
  new URL("./fonts/NotoSansCJKsc-Regular.otf", import.meta.url),
);
const font = create(reportFont);
if (!("hasGlyphForCodePoint" in font))
  throw new Error("Expected a single report font");

const hasGlyph = font.hasGlyphForCodePoint.bind(font);

/** Preserve unsupported characters explicitly instead of emitting an invisible missing glyph. */
export function reportText(text: string) {
  return Array.from(text, (character) => {
    const code = character.codePointAt(0)!;
    return character === "\n" || hasGlyph(code)
      ? character
      : `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
  }).join("");
}
