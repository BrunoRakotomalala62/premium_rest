// Temporary diagnostic probe: is the Vercel Edge egress accepted by Cloudflare?
export const config = { runtime: 'edge' };

export default async function handler() {
  const out = {};
  try {
    const r = await fetch('https://codecraftapi.com/v1/models', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    const t = await r.text();
    out.status = r.status;
    out.isHtml = /<(!doctype|html|head|title)/i.test(t.slice(0, 400));
    out.cfMitigated = r.headers.get('cf-mitigated');
    out.head = t.slice(0, 100);
  } catch (e) {
    out.error = String(e && e.message ? e.message : e);
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
}
