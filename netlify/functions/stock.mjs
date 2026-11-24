/**
 * Live stock from QuickBase "Materials Plant 9000".
 *
 * SAP pushes stock into QuickBase twice a day (around 11:00 and 22:00–23:00),
 * so this reads that table and hands the browser the same header-plus-rows
 * shape as the exported spreadsheet. The user token never leaves the server.
 *
 * Environment (Netlify → Site configuration → Environment variables):
 *   QB_REALM               e.g. epgroup.quickbase.com
 *   QB_USER_TOKEN          QuickBase user token with read access to the table
 *   QB_MATERIALS_TABLE_ID  the Materials Plant 9000 table id
 */
const API = 'https://api.quickbase.com/v1';
const PAGE = 1000;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async () => {
  const realm = process.env.QB_REALM;
  const token = process.env.QB_USER_TOKEN;
  const table = process.env.QB_MATERIALS_TABLE_ID;
  if (!realm || !token || !table) {
    return json({ configured: false, error: 'The QuickBase connection is not set up yet.' }, 503);
  }

  const headers = {
    'QB-Realm-Hostname': realm,
    Authorization: `QB-USER-TOKEN ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    const fieldsRes = await fetch(`${API}/fields?tableId=${encodeURIComponent(table)}`, { headers });
    if (!fieldsRes.ok) return json({ configured: true, error: `QuickBase refused the field list (${fieldsRes.status}).` }, 502);
    const fields = await fieldsRes.json();
    const ids = fields.map((f) => f.id);

    const rows = [];
    for (let skip = 0; ; skip += PAGE) {
      const res = await fetch(`${API}/records/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: table, select: ids, options: { skip, top: PAGE } }),
      });
      if (!res.ok) return json({ configured: true, error: `QuickBase refused the stock query (${res.status}).` }, 502);
      const { data = [], metadata = {} } = await res.json();
      for (const record of data) rows.push(ids.map((id) => record[id]?.value ?? null));
      if (!data.length || rows.length >= (metadata.totalRecords ?? rows.length)) break;
    }

    return json({
      configured: true,
      fetchedAt: new Date().toISOString(),
      grid: [fields.map((f) => f.label), ...rows],
    });
  } catch (e) {
    return json({ configured: true, error: `Could not reach QuickBase: ${e.message}` }, 502);
  }
};
