// Verify the MemWal account on Sui mainnet through Tatum's RPC gateway.
// Verifies the ACCOUNT that owns the notes, not each note (Walrus blob IDs are not Sui objects).
// Never blocks a reply: any failure returns { available: false }.

export const TATUM_SUI_URL = 'https://sui-mainnet.gateway.tatum.io';
const TIMEOUT_MS = 4000;

async function rpc(apiKey, method, params, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(TATUM_SUI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': String(apiKey).trim() },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`tatum ${res.status}`);
    return (await res.json()).result;
  } finally { clearTimeout(timer); }
}

// The RPC answer is data: fixed parsing, digits-only version and checkpoint, and from the
// account object only booleans, a date and a count (no free text is ever passed on).
export function parseChainStatus(obj, checkpoint, accountId) {
  const d = obj && obj.data;
  const exists = !!(d && typeof d.objectId === 'string' && d.objectId.toLowerCase() === String(accountId).toLowerCase());
  const f = (exists && d.content && d.content.fields) || {};
  const ms = /^\d{10,14}$/.test(String(f.created_at)) ? Number(f.created_at) : null;
  return {
    network: 'sui-mainnet',
    accountId: String(accountId),
    exists,
    version: exists && /^\d{1,20}$/.test(String(d.version)) ? String(d.version) : null,
    checkpoint: /^\d{1,20}$/.test(String(checkpoint)) ? String(checkpoint) : null,
    active: exists && typeof f.active === 'boolean' ? f.active : null,
    quarantined: exists && typeof f.admin_quarantined === 'boolean' ? f.admin_quarantined : null,
    createdAt: ms ? new Date(ms).toISOString() : null,
    delegateCount: exists && Array.isArray(f.delegate_keys) ? Math.min(f.delegate_keys.length, 99) : null,
  };
}

export async function chainStatus({ apiKey, accountId, fetchImpl }) {
  if (!apiKey) return { available: false, reason: 'no_key' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(accountId || '').trim())) return { available: false, reason: 'bad_account_format' };
  try {
    const id = String(accountId).trim();
    const [obj, checkpoint] = await Promise.all([
      rpc(apiKey, 'sui_getObject', [id, { showContent: true }], fetchImpl),
      rpc(apiKey, 'sui_getLatestCheckpointSequenceNumber', [], fetchImpl),
    ]);
    return { available: true, ...parseChainStatus(obj, checkpoint, id), checkedAt: new Date().toISOString() };
  } catch (e) {
    // Fixed reason codes only (no upstream text), to tell a bad key from a timeout.
    const m = String(e && e.message);
    const reason = /tatum 40[13]/.test(m) ? 'tatum_auth' : /tatum 429/.test(m) ? 'tatum_rate' : /abort/i.test(m) ? 'timeout' : 'tatum_error';
    return { available: false, reason };
  }
}
