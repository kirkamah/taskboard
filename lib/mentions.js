// Mention syntax. We piggyback on Markdown's [text](url) link syntax:
//
//   [@Иван Иванов](7146231c-fcfe-41e0-a09f-ccfdbd351a59)
//
// Storing the user's UUID as the link href gives us a stable handle that
// survives display-name changes. The Markdown renderer (components/Markdown
// .jsx) detects href values that look like UUIDs and styles them as chips
// instead of links.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENTION_RE = /\[@[^\]]+\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

// Returns deduplicated user IDs mentioned in the text.
export function extractMentions(text) {
  if (!text) return [];
  const out = new Set();
  let m;
  while ((m = MENTION_RE.exec(text))) out.add(m[1].toLowerCase());
  return [...out];
}

// IDs added in `next` but not in `prev`. Used to avoid re-notifying on edits.
export function newMentions(prevText, nextText) {
  const prev = new Set(extractMentions(prevText));
  return extractMentions(nextText).filter((id) => !prev.has(id));
}

export function formatMention(displayName, userId) {
  return `[@${displayName}](${userId})`;
}
