/**
 * Encodes a single character for RTF output. RTF's base encoding (\ansi, cp1252)
 * cannot represent most Vietnamese diacritics, so any character outside printable
 * ASCII is emitted as a \uN Unicode escape (per the RTF 1.9 spec) with a literal
 * "?" fallback glyph for readers that don't support \u.
 */
function encodeChar(ch: string): string {
  const code = ch.codePointAt(0) as number;
  if (code === 0x0a) return "\\par\n";
  if (code === 0x5c || code === 0x7b || code === 0x7d) return `\\${ch}`; // \ { }
  if (code >= 0x20 && code <= 0x7e) return ch;
  if (code === 0x09) return "\\tab ";
  // RTF \u expects a *signed* 16-bit value.
  const signed = code > 0x7fff ? code - 0x10000 : code;
  return `\\u${signed}?`;
}

export function textToRtf(text: string): string {
  const body = [...text.replace(/\r\n/g, "\n")].map(encodeChar).join("");
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033\n{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}}\n\\f0\\fs24 ${body}\n}`;
}
