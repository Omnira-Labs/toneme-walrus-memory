# Toneme × Walrus Memory

**Article:** [My reply coach finally remembers who I'm talking to](https://medium.com/@toneme.app/my-reply-coach-finally-remembers-who-im-talking-to-f3c5f8773a51) · Built for Walrus Session 8: Chatbots That Remember

Memory layer of **Toneme**, a live iOS reply coach on the [App Store](https://apps.apple.com/app/id6802259576). With Memory on, Toneme remembers who each person is to the user and how the user writes to them, so the next reply fits. Notes are stored with **Walrus Memory** (MemWal) on Sui mainnet.

This repo covers the memory layer only. The app, prompts and reply logic are not included.

> Branch `total-recall` adds the learning loop and a Tatum RPC check for the Tatum x Walrus Total Recall hackathon (see "Total Recall update" below). The rest of this README is unchanged from the Walrus Sessions 8 submission.

## Before / after

| Without memory | With memory |
|---|---|
| "Nikos again. Any update on the report?" → generic polite reply | Recalls *"Nikos is accounting colleague; user writes briefly"* → short reply in that style |
| Every conversation starts from zero | Context carries over across sessions and restarts |

## How it works

1. **Opt in.** The user turns on Memory. The phone creates a random 32-hex `memoryId`.
2. **Recall.** The server fetches up to 5 relevant notes from `toneme-<memoryId>`. Timeout: 4 s, then it replies without memory.
3. **Reply.** The model gets the message plus notes and returns replies and one short note.
4. **Remember.** The server saves the note in the background. Notes are Seal-encrypted blobs on Walrus mainnet.

## Design

- **No accounts, no wallets.** One MemWal account and delegate key on the server; one namespace per install. The id is not linked to a person.
- **Graceful.** Memory is off by default. Any memory failure means "reply without memory", never "no reply".
- **Safe notes.** One sentence per reply. No health, money, addresses, phone numbers or passwords.
- **User control.** List, edit, multi-select remove, pagination, and "Forget everything" (new namespace).
- **Verifiable.** Each note shows "Stored on Walrus · View": blob ID, Copy, Open in Walruscan.
- **Honest deletion.** The relayer supports `/api/forget`, but the TypeScript SDK does not expose it yet. Removed notes are hidden from recall and list, stay encrypted, and expire with their storage.
- **Quota.** The shared relayer is rate-limited, so each install has a daily cap of 30 memory operations.

## Total Recall update (20 Oct – 10 Nov 2026)

Built for the Tatum x Walrus Memory hackathon, track **Smart Agents for Real Life**.

### 1. Learning loop: which tone you usually pick for each person

When the user picks a reply (taps Copy), the app sends `{ name, tone }` (no reply text). The server counts picks per person and tone, and once one tone leads uniquely with at least 3 picks it saves a fixed-format note:

```
Nikos: user usually picks the professional tone
```

On the next message from that person, `suggestedTone` comes back with the reply and the app highlights it ("your usual pick") or offers it if it wasn't requested.

| Without the loop | With the loop |
|---|---|
| Always the tones you ticked, nothing learned from what you used | The tone you actually pick for Nikos is suggested next time |

**Safety: code decides, not the model.** The note is built from a template. Name: letters only. Tone: fixed list. The note then passes the same private-detail and instruction filters as every note. The suggestion needs exactly one matching note, the name in the message, and an allowed tone; conflicting notes give no suggestion. See `src/choice-signal.js` and its tests.

### 2. Tatum RPC: verify the memory account on Sui mainnet

`src/chain-status.js` asks Tatum's Sui mainnet gateway (`sui-mainnet.gateway.tatum.io`, `sui_getObject` and `sui_getLatestCheckpointSequenceNumber`) whether the MemWal account object exists, is active and is not quarantined. The app shows "✓ Memory verified · View proof" (Suiscan link).

- Verifies the **account** that owns the notes, not each note (Walrus blob IDs are not Sui objects).
- Cached 5 minutes, 4 s timeout, returns `{ available: false, reason }` on any failure (`no_key`, `tatum_auth`, `tatum_rate`, `timeout`, `tatum_error`: fixed codes, never upstream text). Never blocks a reply.
- The RPC answer is treated as data: fixed parsing (object id must match, digits-only version and checkpoint).

### 3. Proof

- Account: [MemWalAccount on Suiscan](https://suiscan.xyz/mainnet/object/0x2e3249aa0f1473e06788ed331c73e890b93cf86509a644c9f94c7e03f7984fca)
- Learned-tone notes: the learned-tone note ([blob](https://walruscan.com/mainnet/blob/ZsM1evpyWWGsTgB8LK-8VYhlfOwn8RlbYp8ZWwJhCEw)) and two earlier notes ([1](https://walruscan.com/mainnet/blob/74yCFfkMUIijW94GuytkvqOBYzLvtyWDfKoVhGozKlM), [2](https://walruscan.com/mainnet/blob/KT5bnq3XNeQMzL2lR8i-MNVb4n7uXEfoWpp9e6YflYU))
- Demo video: [Toneme learns which tone you use for each person](https://youtube.com/shorts/Pg2CDGZzGtc)
- Article: [My reply coach now learns how I talk to each person](https://medium.com/@toneme.app/my-reply-coach-now-learns-how-i-talk-to-each-person-b9981537291e)

### Known limits (honest)

- Counters are eventually consistent, so very rapid taps can be undercounted.
- The loop learns from the reply the user picks, not from edits made afterwards (the app can't see them).
- This is preference tracking (a counter and a rule), not model training.

## Files

| Path | Purpose |
|---|---|
| `src/memory.js` | recall, remember, list, edit, hide, quota, de-duplication |
| `examples/demo.js` | runnable demo of the same pattern |
| `examples/analyze-with-memory.js` | how the reply endpoint uses it |
| `src/choice-signal.js` | learning loop: tone-choice note and suggestion (Total Recall) |
| `src/chain-status.js` | Tatum Sui RPC check of the memory account (Total Recall) |
| `test/choice-and-chain.test.js` | tests for both (`npm test`) |

## Run the demo

Requires Node 20.6+ and your own Walrus Memory account ([dashboard](https://memory.walrus.xyz/dashboard)).

```bash
git clone https://github.com/Omnira-Labs/toneme-walrus-memory && cd toneme-walrus-memory
npm install
cp .env.example .env   # fill in your own MEMWAL_ACCOUNT_ID and MEMWAL_KEY
npm run demo -- remember "Nikos is accounting colleague; user writes briefly"
npm run demo -- recall "Nikos again. Any update on the report?"
```

Each run uses a new namespace, like a new install. Set `DEMO_MEMORY_ID` to reuse one. Allow up to 30 s between `remember` and `recall`.

## Run the tests

No account or keys needed (the Tatum calls are replaced by a fake `fetch`).

```bash
npm test
```

11 tests cover the note template, name and tone validation, planted and conflicting notes, the 3-pick rule, and the chain-status parsing and failure codes.

## Model and runtime

**Llama 3.3 70B** (`llama-3.3-70b-versatile`, open-weight) on **Groq**. Fallbacks: `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`, also on Groq.

Friction with Walrus Memory in this setup:

- **Stacked rate limits.** Groq can return 429, and the relayer is rate-limited too. Fix: 4 s recall timeout, background saves, model fallback on 429.
- **Model notes need guarding.** Llama sometimes produced malformed notes ("colleague is colleague", "partner is romantic partner") or near-duplicates. Fix: the server drops them before `remember`.
- **Recall lag.** A new note can take ~15–30 s to become recallable.

## Proof on Walrus mainnet

**Usage:** 3 real users on separate iPhones, 10+ notes each, 94 memory-backed requests.

**Videos:** [walkthrough](https://youtube.com/shorts/kJid6zxQHD0) · [promo](https://www.youtube.com/watch?v=z-2GmgjDBEo)

**Verify in the app (v1.0.3):** My memory → View under any note → blob ID, Copy, Open in Walruscan. Example active note: [HWehaD6j…](https://walruscan.com/mainnet/blob/HWehaD6jUGUMsBlD70_C9FL9ntaKi9BvZNIEqBLQ6nA)

**Example blobs by install** (one install = one phone):

| Install | Requests | Blobs |
|---|---|---|
| A | 26 | [1](https://walruscan.com/mainnet/blob/ylZKYu8yLm-fADEKKF0Vl8LMoMLWm4Qz7rrCS8r9nsI) · [2](https://walruscan.com/mainnet/blob/FQUyPSAymy6V2piVm_Z7A0yyJlIW9TwBnXpRF1Dy9vw) · [3](https://walruscan.com/mainnet/blob/vivh49Q5644HjpM3NLHcZX-i5hnrXoPWWf7zY56Kgh0) |
| B | 15 | [1](https://walruscan.com/mainnet/blob/hmt0Ba9nKeS-QvfussvQ12HAaPjFn7i1Ru27z54JP5U) · [2](https://walruscan.com/mainnet/blob/nZGy9K6mpGdXYpxX_I3gjxP5yGSTTi91EmR3gCZcJBE) |
| C | 4 | [1](https://walruscan.com/mainnet/blob/mN7KyeHIUv13jMP-tPL2XhqLhOQSn1RmyEcKsC3MHuw) |
| D | 2 | [1](https://walruscan.com/mainnet/blob/Ek96-5Gt-nStAZtCsevq_tKUMngApqsZ27JlvIM-I5E) · [2](https://walruscan.com/mainnet/blob/5mgPgk6i6Wij7r4m65jMiPgRTCVAsxBBploWfjfpyhw) |
| E | 11 | [1](https://walruscan.com/mainnet/blob/Qz-sA53O_WWPbuQ3M2m8krh8Tx8HKD7WWhVYOdWuLuo) |

**Account:** [MemWalAccount on Suiscan](https://suiscan.xyz/mainnet/object/0x2e3249aa0f1473e06788ed331c73e890b93cf86509a644c9f94c7e03f7984fca)

## Feedback for the Walrus Memory team

- **Gap:** relayer rate-limit weights are undocumented and responses have no `X-RateLimit-*` headers, so per-user quota can't be budgeted in a multi-user app.
- **Improvement:** expose `forget` (per namespace and per note) in the TypeScript SDK, so apps can truly delete a user's notes instead of hiding them.
- **Bug report:** [MystenLabs/MemWal#1103](https://github.com/MystenLabs/MemWal/issues/1103), `recall({ sort: "recent", maxTokens })` drops the most relevant hits.

## License

MIT, see [LICENSE](LICENSE). This covers the memory layer in this repo only; the Toneme app is not included.
