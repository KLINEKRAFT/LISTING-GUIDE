// ─────────────────────────────────────────────────────────────────────────────
// Coldwell Banker Select — Listing Guide
// Edge function: fetches the Zillow XML feed, strips fat, returns lean JSON.
// ─────────────────────────────────────────────────────────────────────────────
export const config = { runtime: "edge" };

const FEED = "http://realistiq.net/exports/iq_cb_select_zillow.xml";

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  try {
    const res = await fetch(FEED, {
      headers: { "User-Agent": "Mozilla/5.0 (CBSelect-ListingGuide/1.0)" },
      cf: { cacheTtl: 1800 },
    });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    const xml = await res.text();

    // ── Fast regex parse (DOM is too slow in edge runtime) ──
    // Feed wraps every value in <![CDATA[...]]> — match wrapped OR bare.
    const listings = [];
    const listingRx = /<Listing>([\s\S]*?)<\/Listing>/g;
    const g = (block, tag) => {
      const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`));
      return m ? (m[1] ?? m[2] ?? "").trim() : "";
    };
    const firstPic = block => {
      const m = block.match(/<PictureUrl>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/PictureUrl>/);
      return m ? (m[1] ?? m[2] ?? "").trim() : "";
    };

    let match;
    while ((match = listingRx.exec(xml)) !== null) {
      const b = match[1];
      listings.push({
        a: g(b, "StreetAddress"),
        c: g(b, "City"),
        s: g(b, "State"),
        z: g(b, "Zip"),
        st: g(b, "Status"),
        p: parseInt(g(b, "Price")) || 0,
        id: g(b, "MlsId"),
        u: g(b, "ListingUrl"),
        t: g(b, "PropertyType"),
        bd: parseInt(g(b, "Bedrooms")) || 0,
        ba: parseFloat(g(b, "Bathrooms")) || 0,
        sf: parseInt(g(b, "LivingArea")) || 0,
        lot: parseFloat(g(b, "LotSize")) || 0,
        yr: parseInt(g(b, "YearBuilt")) || 0,
        pic: firstPic(b),
        af: g(b, "FirstName"),
        al: g(b, "LastName"),
        ae: g(b, "EmailAddress"),
        ap: g(b, "OfficeLineNumber"),
        o: g(b, "OfficeName"),
      });
    }

    // ── Pre-compute aggregates ──
    const active = listings.filter(l => /active/i.test(l.st));
    const prices = active.map(l => l.p).filter(p => p > 0);
    const sorted = [...prices].sort((a, b) => a - b);
    const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;

    const cityCount = {};
    listings.forEach(l => { if (l.c) cityCount[l.c] = (cityCount[l.c] || 0) + 1; });

    const agentIndex = {};
    listings.forEach(l => {
      const name = `${l.af} ${l.al}`.trim();
      if (!name) return;
      if (!agentIndex[name]) agentIndex[name] = { email: l.ae, phone: l.ap, office: l.o, count: 0 };
      agentIndex[name].count++;
    });

    const typeCount = {};
    listings.forEach(l => { if (l.t) typeCount[l.t] = (typeCount[l.t] || 0) + 1; });

    return new Response(JSON.stringify({
      v: 2,
      total: listings.length,
      activeCount: active.length,
      stats: { avg, med, min, max },
      cityCount,
      typeCount,
      agentIndex,
      listings,
      generatedAt: new Date().toISOString(),
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Feed parse failed", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
