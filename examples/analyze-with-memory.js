// How the reply endpoint uses memory (simplified from Toneme).
import { memoryEnabled, memoryQuotaOk, recallMemories, memoryPromptBlock, memoryClient, cleanNote, isNearDuplicate } from '../src/memory.js';

export async function analyze(request, env, ctx, callModel) {
  const { message, memoryId } = await request.json();

  // 1) Recall (opt-in, capped, time-boxed). Any failure = no memory.
  let memories = null;
  if (memoryEnabled(env, memoryId) && (await memoryQuotaOk(env.KV, memoryId))) {
    try { memories = await recallMemories(env, memoryId, message); } catch { memories = []; }
  }

  // 2) Generate replies; when memory is on, the system prompt includes what we
  //    know and asks the model for one short "memory_note".
  const extra = memories !== null ? memoryPromptBlock(memories) : '';
  const result = await callModel(message, extra); // returns { replies, memory_note }

  // 3) Remember in the background so the user never waits on Walrus.
  const note = cleanNote(result.memory_note);
  if (memories !== null && note && !isNearDuplicate(note, memories)) {
    ctx.waitUntil(memoryClient(env, memoryId).remember(note).catch(() => {}));
  }

  return Response.json({ replies: result.replies, memoryUsed: (memories || []).length > 0 });
}
