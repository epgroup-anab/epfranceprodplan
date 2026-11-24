import { parseMaterialsGrid } from './parseMaterials.js';

const ENDPOINT = '/.netlify/functions/stock';

/**
 * Pull stock straight from QuickBase through the site's own function.
 * Resolves to { status: 'live', materials, counts, fetchedAt },
 * { status: 'not-configured' } or { status: 'error', error }.
 */
export async function fetchLiveStock() {
  let res;
  try {
    res = await fetch(ENDPOINT, { cache: 'no-store' });
  } catch (e) {
    return { status: 'error', error: `Could not reach the stock feed: ${e.message}` };
  }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) return { status: 'not-configured' };   // no function, e.g. local dev
  const body = await res.json();
  if (body.configured === false) return { status: 'not-configured' };
  if (!res.ok || body.error) return { status: 'error', error: body.error || `Stock feed returned ${res.status}.` };
  try {
    const { materials, counts } = parseMaterialsGrid(body.grid || []);
    return { status: 'live', materials, counts, fetchedAt: body.fetchedAt };
  } catch (e) {
    return { status: 'error', error: `QuickBase answered, but the table did not look like Materials Plant 9000: ${e.message}` };
  }
}
