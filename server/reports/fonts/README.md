# Portable report font

Noto Sans CJK SC Regular preserves international names in generated report PDFs.

- Upstream: https://github.com/notofonts/noto-cjk
- Source: Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
- Downloaded 2026-09-30; licensed under SIL Open Font License 1.1 (see LICENSE).
- Covers Latin, Greek, Cyrillic, Chinese, Japanese, and Korean glyphs. PDFKit embeds
  only the glyph subset used in each report; the full font is not attached to emails.
- Characters outside the bundled font are rendered as explicit `[U+XXXX]` codepoint
  labels. This preserves their identity instead of silently dropping unsupported
  scripts, symbols, or emoji. The PDF includes a note when fallback labels are used.
- The regular font is used throughout, with size/color distinguishing headings.
  No host-specific font installation or runtime network request is required.
