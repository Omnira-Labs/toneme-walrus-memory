# Toneme × Walrus Memory

**Toneme** is a live iOS app (App Store) that suggests replies to messages you receive. It now includes **Memory (beta)**: with your permission, Toneme remembers who people are to you and how you like to write to them, so the next reply sounds more like you. That memory is stored with **Walrus Memory** (MemWal) on Sui mainnet.

This repo shows how the memory layer works. The app, its prompts and its communication rules are not included.

## What changes with memory

| Without memory | With memory |
|---|---|
| "Nikos again. Any update on the report?" → generic polite reply | Toneme recalls *"Nikos is accounting colleague; user writes briefly"* → a short, on-point reply in that style |
| Every conversation starts from zero | Context carries over between sessions and app restarts |

## How it works

1. **Turn it on.** The user turns on Memory in Settings. The phone creates a random code (`memoryId`) and keeps it on the device.
2. **Send a message.** The app sends the received message and the `memoryId` to the Toneme server.
3. **Recall.** The server asks Walrus Memory for up to 5 relevant notes from that phone's own space, `toneme-<memoryId>`. If this takes more than 4 seconds, it continues without memory.
4. **Reply.** The model (Llama 3.3 70B, open-weight; gpt-oss models as fallbacks) gets the message and the notes, and returns the suggested replies plus one short note, e.g. *"Nikos is accounting colleague; user writes briefly"*.
5. **Remember.** The server saves that note to Walrus Memory in the background, so the user never waits. Notes are encrypted (Seal) and stored on Walrus mainnet.

## Design decisions

- **No accounts, no wallet for end users.** One MemWal account and delegate key stay on the server. Each install gets a random 32-hex `memoryId` → its own namespace. The id is not linked to a person.
- **Opt-in and graceful.** Memory is off by default. Recall has a 4-second timeout, and any failure means "reply without memory", never "no reply".
- **Small, safe notes.** The model writes at most one sentence per reply. Health, money, addresses, phone numbers and passwords are excluded by instruction.
- **User control.** "My memory" lists notes, supports edit (hide old + remember new), multi-select remove, pagination, and "Forget everything" (new namespace).
- **Verifiable notes.** Under each note, "Stored on Walrus · View" shows its blob ID, with Copy and "Open in Walruscan", so anyone can check that the note is a real encrypted blob on mainnet.
- **Honest deletion.** The relayer can delete a whole namespace (`/api/forget`), but the TypeScript SDK doesn't expose it yet. Until it does, removed notes are hidden from every recall and list, stay encrypted, and expire with their storage.
- **Relayer limits.** The shared relayer is rate-limited, so each install has a daily cap (30 memory operations).

## Files

- `src/memory.js`: recall, remember, list, edit, hide, quota and prompt block.
- `examples/analyze-with-memory.js`: how the reply endpoint uses it.

## Setup

```bash
npm install @mysten-incubation/memwal @mysten/sui @mysten/seal @mysten/walrus
# Edge runtimes: enable Node.js compatibility
# secrets: MEMWAL_ACCOUNT_ID, MEMWAL_KEY (delegate key)
```

## Proof on Walrus mainnet

Each memory note is one Seal-encrypted blob on Walrus mainnet.

Toneme has 3 real users on separate iPhones, each with 10+ memory notes. So far there are 94 memory-backed requests in total; the three users' installs have 26, 15 and 11.

In the app (v1.0.3), tap **View** under any note in My memory to see its blob ID, e.g. an active note: https://walruscan.com/mainnet/blob/HWehaD6jUGUMsBlD70_C9FL9ntaKi9BvZNIEqBLQ6nA

More example blobs (from removed notes), grouped by install (each install = one phone's anonymous memory space; labels are ours, the explorer can't link a blob to a phone):

| Install | Memory-backed requests | Example blobs |
|---|---|---|
| A | 26 | [1](https://walruscan.com/mainnet/blob/ylZKYu8yLm-fADEKKF0Vl8LMoMLWm4Qz7rrCS8r9nsI) · [2](https://walruscan.com/mainnet/blob/FQUyPSAymy6V2piVm_Z7A0yyJlIW9TwBnXpRF1Dy9vw) · [3](https://walruscan.com/mainnet/blob/vivh49Q5644HjpM3NLHcZX-i5hnrXoPWWf7zY56Kgh0) |
| B | 15 | [1](https://walruscan.com/mainnet/blob/hmt0Ba9nKeS-QvfussvQ12HAaPjFn7i1Ru27z54JP5U) · [2](https://walruscan.com/mainnet/blob/nZGy9K6mpGdXYpxX_I3gjxP5yGSTTi91EmR3gCZcJBE) |
| C | 4 | [1](https://walruscan.com/mainnet/blob/mN7KyeHIUv13jMP-tPL2XhqLhOQSn1RmyEcKsC3MHuw) |
| D | 2 | [1](https://walruscan.com/mainnet/blob/Ek96-5Gt-nStAZtCsevq_tKUMngApqsZ27JlvIM-I5E) · [2](https://walruscan.com/mainnet/blob/5mgPgk6i6Wij7r4m65jMiPgRTCVAsxBBploWfjfpyhw) |
| E | 11 | [1](https://walruscan.com/mainnet/blob/Qz-sA53O_WWPbuQ3M2m8krh8Tx8HKD7WWhVYOdWuLuo) |

MemWalAccount: https://suiscan.xyz/mainnet/object/0x2e3249aa0f1473e06788ed331c73e890b93cf86509a644c9f94c7e03f7984fca

## Feedback for the Walrus Memory team

- **Bug / gap:** relayer rate-limit weights aren't documented, and there are no `X-RateLimit-*` headers. For a multi-user app on one account, quota can't be budgeted per user.
- **Improvement:** expose `forget` (per namespace and per note) in the TypeScript SDK, so consumer apps can truly delete a user's notes instead of hiding them.

## License

© 2026 Omnira Labs. All rights reserved. You may view this code and run it locally to evaluate it (e.g. for Walrus Sessions judging). Any other use, copying or redistribution is not permitted.
