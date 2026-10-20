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

// The RPC answer is data: fixed parsing, digits-only version and checkpoint.
export function parseChainStatus(obj, checkpoint, accountId) {
  const d = obj && obj.data;
  const exists = !!(d && typeof d.objectId === 'string' && d.objectId.toLowerCase() === String(accountId).toLowerCase());
  return {
    network: 'sui-mainnet',
    accountId: String(accountId),
    exists,
    version: exists && /^\d{1,20}$/.test(String(d.version)) ? String(d.version) : null,
    checkpoint: /^\d{1,20}$/.test(String(checkpoint)) ? String(checkpoint) : null,
  };
}

export async function chainStatus({ apiKey, accountId, fetchImpl }) {
  if (!apiKey) return { available: false, reason: 'no_key' };
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(accountId || '').trim())) return { available: false, reason: 'bad_account_format' };
  try {
    const id = String(accountId).trim();
    const [obj, checkpoint] = await Promise.all([
      rpc(apiKey, 'sui_getObject', [id, { showType: false, showOwner: false }], fetchImpl),
      rpc(apiKey, 'sui_getLatestCheckpointSequenceNumber', [], fetchImpl),
    ]);
    return { available: true, ...parseChainStatus(obj, checkpoint, id), checkedAt: new Date().toISOString() };
  } catch {
    return { available: false, reason: 'unavailable' };
  }
}
