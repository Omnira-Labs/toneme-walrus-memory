# Toneme × Walrus Memory

**Toneme** is a live iOS app (App Store) that suggests replies to messages you receive. Version 1.0.1 adds **Memory (beta)**: with your permission, Toneme remembers who people are to you and how you like to write to them, so the next reply sounds more like you. That memory is stored with **Walrus Memory** (MemWal) on Sui mainnet.

This repo shows how the memory layer works. The app, its prompts and its communication rules are not included.

## What changes with memory

| Without memory | With memory |
|---|---|
| "Nikos again. Any update on the report?" → generic polite reply | Toneme recalls *"Nikos is from accounting; user writes to him formally"* → a short, formal, on-point reply |
| Every conversation starts from zero | Context carries over between sessions and app restarts |

## How it works

```
iPhone (opt-in, random memoryId)
   │  message + memoryId
   ▼
Server ── recall(namespace "toneme-<memoryId>") ──► Walrus Memory relayer ──► Walrus (Seal-encrypted)
   │  prompt = rules + recalled notes
   ▼
LLM (gpt-oss-120b, with fallbacks) → replies + one short "memory_note"
   │
   └─ remember(note) in the background (user never waits)
```

## Design decisions

- **No accounts, no wallet for end users.** One MemWal account and delegate key stay on the server. Each install gets a random 32-hex `memoryId` → its own namespace. The id is not linked to a person.
- **Opt-in and graceful.** Memory is off by default. Recall has a 4-second timeout, and any failure means "reply without memory", never "no reply".
- **Small, safe notes.** The model writes at most one sentence per reply. Health, money, addresses, phone numbers and passwords are excluded by instruction.
- **User control.** "My memory" lists notes, supports edit (hide old + remember new), multi-select remove, pagination, and "Forget everything" (new namespace).
- **Honest deletion.** Walrus Memory has no per-end-user delete, so removed notes are hidden from every recall and list, stay encrypted, and expire with their storage. The owner can bulk-delete from the dashboard.
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
- **Improvement:** a documented pattern (or API) for **per-end-user deletion** in multi-tenant apps. Today, only the owner wallet can delete, so consumer apps can only hide notes.

## License

© 2026 Omnira Labs. All rights reserved. Shared for review only (Walrus Sessions). No license is granted to copy, modify or use this code.
