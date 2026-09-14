const MOJIBAKE_MARKERS = /[ÃÂ]|á[º»]|Ì[\x80-\xBF]|Ç[\x80-\xBF]/g;

function markerCount(value) {
  return (value.match(MOJIBAKE_MARKERS) || []).length;
}

// Some Sahara responses contain UTF-8 bytes that have already been interpreted
// as Latin-1 (for example, "KÃ² sÃ­" instead of "Kò sí"). Repair only when the
// conversion is lossless and removes mojibake markers, so valid Yoruba remains
// untouched.
export function repairUtf8Mojibake(value = "") {
  if (!markerCount(value)) return value;
  const characters = [...value];
  if (characters.some((character) => character.codePointAt(0) > 255)) return value;
  try {
    const bytes = Uint8Array.from(characters, (character) => character.codePointAt(0));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return markerCount(repaired) < markerCount(value) ? repaired : value;
  } catch {
    return value;
  }
}
