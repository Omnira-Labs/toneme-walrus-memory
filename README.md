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
4. **Reply.** The model (gpt-oss-120b) gets the message and the notes, and returns the suggested replies plus one short note, e.g. *"Nikos is accounting colleague; user writes briefly"*.
5. **Remember.** The server saves that note to Walrus Memory in the background, so the user never waits. Notes are encrypted (Seal) and stored on Walrus mainnet.

## Design decisions

- **No accounts, no wallet for end users.** One MemWal account and delegate key stay on the server. Each install gets a random 32-hex `memoryId` → its own namespace. The id is not linked to a person.
- **Opt-in and graceful.** Memory is off by default. Recall has a 4-second timeout, and any failure means "reply without memory", never "no reply".
- **Small, safe notes.** The model writes at most one sentence per reply. Health, money, addresses, phone numbers and passwords are excluded by instruction.
- **User control.** "My memory" lists notes, supports edit (hide old + remember new), multi-select remove, pagination, and "Forget everything" (new namespace).
- **Honest deletion.** Walrus Memory has no per-end-user delete, so removed notes are hidden from every recall and list, stay encrypted, and expire with their storage.
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

## Feedback for the Walrus Memory team

- **Bug / gap:** relayer rate-limit weights aren't documented, and there are no `X-RateLimit-*` headers. For a multi-user app on one account, quota can't be budgeted per user.
- **Improvement:** a way to permanently delete one user's notes before they expire. Today a consumer app can only hide them.

## License

© 2026 Omnira Labs. All rights reserved. You may view this code and run it locally to evaluate it (e.g. for Walrus Sessions judging). Any other use, copying or redistribution is not permitted.
