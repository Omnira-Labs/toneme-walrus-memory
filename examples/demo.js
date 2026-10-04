// Minimal runnable demo of the Toneme memory pattern on Walrus mainnet:
// one namespace per install, one short note per reply, recall before the next reply.
//
//   cp .env.example .env    # fill in your own MemWal account + delegate key
//   npm install
//   npm run demo -- remember "Nikos is accounting colleague; user writes briefly"
//   npm run demo -- recall "Nikos again. Any update on the report?"
import { randomBytes } from 'node:crypto';
import { MemWal } from '@mysten-incubation/memwal';
import { cleanNote, isNearDuplicate } from '../src/memory.js';

const { MEMWAL_KEY, MEMWAL_ACCOUNT_ID } = process.env;
const MEMWAL_RELAYER_URL = process.env.MEMWAL_RELAYER_URL || 'https://relayer.memory.walrus.xyz';
// Toneme uses a random 32-hex id per install; set DEMO_MEMORY_ID to reuse one.
const memoryId = process.env.DEMO_MEMORY_ID || randomBytes(16).toString('hex');

if (!MEMWAL_KEY || !MEMWAL_ACCOUNT_ID) {
  console.error('Set MEMWAL_KEY (delegate key) and MEMWAL_ACCOUNT_ID in .env');
  process.exit(1);
}

const client = MemWal.create({
  key: MEMWAL_KEY,
  accountId: MEMWAL_ACCOUNT_ID,
  serverUrl: MEMWAL_RELAYER_URL,
  namespace: `toneme-${memoryId}`,
});

const [cmd, ...rest] = process.argv.slice(2);
const text = rest.join(' ');
console.log(`namespace: toneme-${memoryId}`);

if (cmd === 'remember' && text) {
  const note = cleanNote(text);
  const res = await client.recall({ query: note, limit: 5 });
  const existing = (res?.results || []).map((r) => r.text);
  if (isNearDuplicate(note, existing)) {
    console.log('skipped: near-duplicate of a note already stored');
  } else {
    const out = await client.remember(note);
    console.log('remembered:', note);
    if (out?.blob_id) console.log(`blob: https://walruscan.com/mainnet/blob/${out.blob_id}`);
  }
} else if (cmd === 'recall' && text) {
  // New notes can take up to ~30 seconds to become recallable.
  const res = await client.recall({ query: text, limit: 5 });
  const results = res?.results || [];
  if (!results.length) console.log('no notes yet');
  for (const r of results) {
    console.log(`- ${r.text}`);
    if (r.blob_id) console.log(`  https://walruscan.com/mainnet/blob/${r.blob_id}`);
  }
} else {
  console.log('usage: npm run demo -- remember "<note>" | recall "<message>"');
}
