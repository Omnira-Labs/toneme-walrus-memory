// Learning loop: which tone the user copies for a person.
// The note is built from a template, never from free text, and a suggestion is
// derived by code, never by the model.

export const VALID_TONES = ['warm', 'confident', 'short', 'professional', 'factual', 'flirty'];
export const CHOICE_MIN_PICKS = 3; // "usually" must be true: at least 3 copies of one tone

const NAME_RE = /^\p{L}[\p{L}-]{1,19}$/u;
const CHOICE_NOTE_RE = /^(\p{L}[\p{L}-]{1,19}): user usually picks the (warm|confident|short|professional|factual|flirty) tone$/u;

// Same spirit as the filters on every other note: no contact details or amounts,
// and no text that tells the model to do something.
const PRIVATE_RE = /[€$£]\s?\d|\d\s?(?:€|\$|£|eur\b|euros?\b|usd\b)|[^\s@]+@[^\s@]+\.[a-z]{2,}|\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|gr|net|org|io|app|me)\b|\+?\d(?:[\s().-]?\d){7,}/i;
const INSTRUCTION_RE = /\b(always|never|ignore|disregard|forget|override|bypass|from now on|you must|you should|you are|do not|reply with|respond with|pretend|act as|system|instruction|prompt|jailbreak|developer|admin|promise|promises|agree|agrees|approve|approved|owe|owes|pay|pays|transfer|permission)\b/i;

export function senderNameFromNote(note) {
  const m = /^(\p{L}[\p{L}-]{1,19}) is /u.exec(String(note || ''));
  return m ? m[1] : null;
}

export function buildChoiceNote(name, tone) {
  if (!NAME_RE.test(String(name)) || !VALID_TONES.includes(tone)) return null;
  const note = `${name}: user usually picks the ${tone} tone`;
  return PRIVATE_RE.test(note) || INSTRUCTION_RE.test(note) ? null : note;
}

// Returns a tone only when exactly one recalled choice note matches a name in the
// message and the tone is allowed. Conflicting notes mean no suggestion.
export function suggestTone(memories, message, allowedTones = VALID_TONES) {
  const text = String(message || '').toLowerCase();
  const tones = new Set();
  for (const m of memories || []) {
    const hit = CHOICE_NOTE_RE.exec(String(m));
    if (hit && text.includes(hit[1].toLowerCase())) tones.add(hit[2]);
  }
  if (tones.size !== 1) return null;
  const tone = [...tones][0];
  return allowedTones.includes(tone) ? tone : null;
}

// Pure counter step. `state` is { counts, noted }; returns the new state and the
// note to save (or null). Persist `state` however you like (KV, DB).
export function recordChoice(state, name, tone) {
  if (!NAME_RE.test(String(name)) || !VALID_TONES.includes(tone)) return { state, note: null };
  const counts = { ...((state && state.counts) || {}) };
  counts[tone] = Math.min((parseInt(counts[tone], 10) || 0) + 1, 1000);
  const ranked = Object.entries(counts).filter(([t]) => VALID_TONES.includes(t)).sort((a, b) => b[1] - a[1]);
  const [leader, top] = ranked[0];
  const unique = !ranked[1] || ranked[1][1] < top;
  const noted = (state && state.noted) || null;
  if (top >= CHOICE_MIN_PICKS && unique && leader !== noted) {
    const note = buildChoiceNote(name, leader);
    if (note) return { state: { counts, noted: leader }, note };
  }
  return { state: { counts, noted }, note: null };
}
