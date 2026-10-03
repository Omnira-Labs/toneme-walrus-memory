// Toneme × Walrus Memory: the memory layer of a live iOS reply coach.
//
// Design choices (consumer app, no accounts, no wallet):
// - One MemWal account + delegate key live on the server only (server secrets).
// - Each app install gets a random 32-hex memoryId; its notes live in their
//   own namespace "toneme-<memoryId>". The id never maps to a person.
// - Opt-in only. Any memory failure degrades to "no memory": replies never
//   depend on it.
// - The model writes one short, non-sensitive note per reply ("memory_note").
// - Users can edit, remove or reset notes. Walrus has no per-user delete, so
//   removed notes are hidden from every recall/list and expire on their own.
// - The shared public relayer is rate-limited, so each install gets a daily cap.

import { MemWal } from '@mysten-incubation/memwal';

export const MEMORY_DAILY_LIMIT = 30;
const RECALL_TIMEOUT_MS = 4000;

export function memoryEnabled(env, memoryId) {
  return !!(env.MEMWAL_KEY && env.MEMWAL_ACCOUNT_ID && /^[a-f0-9]{32}$/.test(memoryId || ''));
}

export function memoryClient(env, memoryId) {
  return MemWal.create({
    key: env.MEMWAL_KEY,                 // delegate key, never the owner key
    accountId: env.MEMWAL_ACCOUNT_ID,
    serverUrl: env.MEMWAL_RELAYER_URL || 'https://relayer.memory.walrus.xyz',
    namespace: `toneme-${memoryId}`,
  });
}

// Per-install daily cap (KV counter that expires after a day).
export async function memoryQuotaOk(kv, memoryId) {
  if (!kv) return true;
  const key = `mem:${memoryId}:${new Date().toISOString().slice(0, 10)}`;
  const n = parseInt((await kv.get(key)) || '0', 10);
  if (n >= MEMORY_DAILY_LIMIT) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

// Notes the user removed (by Walrus blob id), kept out of every recall/list.
export async function hiddenIds(kv, memoryId) {
  if (!kv) return new Set();
  try { return new Set(JSON.parse((await kv.get(`memhide:${memoryId}`)) || '[]')); } catch { return new Set(); }
}

export async function hideIds(kv, memoryId, ids) {
  if (!kv) return;
  const set = await hiddenIds(kv, memoryId);
  for (const id of ids) if (typeof id === 'string' && id.length <= 128) set.add(id);
  await kv.put(`memhide:${memoryId}`, JSON.stringify([...set].slice(-1000)));
}

export function cleanNote(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Recall up to 5 relevant notes, with a hard timeout so replies never wait long.
export async function recallMemories(env, memoryId, query) {
  const client = memoryClient(env, memoryId);
  const [res, hidden] = await Promise.all([
    Promise.race([
      client.recall({ query, limit: 8, maxDistance: 0.7 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('memory recall timeout')), RECALL_TIMEOUT_MS)),
    ]),
    hiddenIds(env.KV, memoryId),
  ]);
  return (res?.results || [])
    .filter((r) => !hidden.has(r.blob_id))
    .slice(0, 5)
    .map((r) => String(r.text || '').slice(0, 200))
    .filter(Boolean);
}

// Prompt block: the recalled notes are added to the system prompt, and the
// model is asked for one short, non-sensitive "memory_note" (who the sender is
// to the user and how the user writes to them). Exact wording is not published.
export function memoryPromptBlock(memories) {
  return { memories, wantsNote: true };
}

// List (newest first) for the in-app "My memory" screen.
export async function listMemories(env, memoryId) {
  const client = memoryClient(env, memoryId);
  const [res, hidden] = await Promise.all([
    client.recall({ query: 'people the user talks to and how the user likes to write to them', limit: 100, sort: 'recent' }),
    hiddenIds(env.KV, memoryId),
  ]);
  return (res?.results || [])
    .filter((r) => !hidden.has(r.blob_id))
    .map((r) => ({ id: r.blob_id, text: String(r.text || ''), at: r.created_at || null }));
}

// Edit = hide the old note + remember the corrected text.
export async function editMemory(env, ctx, memoryId, id, text) {
  await hideIds(env.KV, memoryId, [id]);
  const save = memoryClient(env, memoryId).remember(cleanNote(text)).catch(() => {});
  ctx?.waitUntil?.(save);
}

// Skip saving a note that adds nothing new to one we just recalled
// (e.g. "Eleni is friend…" vs "Eleni is a friend…").
const NOTE_STOPWORDS = new Set(['a', 'an', 'the', 'is', 'to', 'them', 'her', 'him', 'user', 'writes', 'and']);

function noteTokens(text) {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter((w) => w && !NOTE_STOPWORDS.has(w)));
}

export function isNearDuplicate(note, recalled) {
  const n = noteTokens(note);
  if (!n.size) return false;
  return (recalled || []).some((m) => {
    const o = noteTokens(m);
    let shared = 0;
    for (const w of n) if (o.has(w)) shared++;
    return shared === n.size || shared / (n.size + o.size - shared) >= 0.75;
  });
}
