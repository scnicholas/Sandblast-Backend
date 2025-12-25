// -----------------------------
// Moment normalization / drift repair (Top40Weekly ingest fixes)
// -----------------------------
const KNOWN_ARTISTS_SECOND_TOKEN = new Set([
  'Madonna',
  'Aerosmith',
  'Whitesnake',
]);

function _asText(x) { return (x == null ? '' : String(x)).trim(); }

function normalizeMomentFields(m) {
  if (!m || typeof m !== 'object') return m;

  let artist = _asText(m.artist);
  let title  = _asText(m.title);
  const year = Number(m.year);

  // 1) Hard fixes for known corrupted rows (deterministic, zero-risk)
  if (year === 1989 && /^Prayer Madonna$/i.test(artist) && /^Like a$/i.test(title)) {
    artist = 'Madonna';
    title  = 'Like a Prayer';
  }

  if (year === 1989 && /^Elevator Aerosmith$/i.test(artist) && /^Love in an$/i.test(title)) {
    artist = 'Aerosmith';
    title  = 'Love in an Elevator';
  }

  if (year === 1989 && /^Healey Band$/i.test(artist) && /^Angel Eyes The Jeff$/i.test(title)) {
    artist = 'The Jeff Healey Band';
    title  = 'Angel Eyes';
  }

  // (You already saw this one earlier)
  if (year === 1988 && /^Love Whitesnake$/i.test(artist) && /^Is This$/i.test(title)) {
    artist = 'Whitesnake';
    title  = 'Is This Love';
  }

  // 2) Generic “two-token artist drift” repair:
  // Example: "Prayer Madonna" + "Like a" -> "Madonna" + "Like a Prayer"
  // Example: "Elevator Aerosmith" + "Love in an" -> "Aerosmith" + "Love in an Elevator"
  // Safe rule: ONLY if artist is exactly 2 tokens and token2 is a known artist.
  const parts = artist.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && KNOWN_ARTISTS_SECOND_TOKEN.has(parts[1])) {
    const spill = parts[0];     // e.g., "Prayer", "Elevator"
    const candidateArtist = parts[1];

    // Only apply if title looks truncated (very short or ends with a hanging preposition/article)
    const titleLooksTruncated =
      title.split(/\s+/).filter(Boolean).length <= 4 ||
      /\b(a|an|the|this|that|to|in|on|of|for|with)\b$/i.test(title);

    if (titleLooksTruncated) {
      artist = candidateArtist;
      title = `${title} ${spill}`.trim();
    }
  }

  // Push back to object
  m.artist = artist;
  m.title  = title;

  return m;
}
