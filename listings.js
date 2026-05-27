export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }

  const FEED = "http://realistiq.net/exports/iq_cb_select_zillow.xml";

  try {
    const res = await fetch(FEED, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CBSelect/1.0)" },
    });

    if (!res.ok) throw new Error(`Feed returned ${res.status}`);

    const xml = await res.text();

    // Parse listings from XML
    const listings = [];
    const listingRegex = /<Listing>([\s\S]*?)<\/Listing>/g;
    const get = (block, tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return m ? m[1].trim() : "";
    };
    const getPic = block => {
      const m = block.match(/<PictureUrl>([^<]*)<\/PictureUrl>/);
      return m ? m[1].trim() : "";
    };

    let match;
    while ((match = listingRegex.exec(xml)) !== null) {
      const b = match[1];
      listings.push({
        address:    get(b, "StreetAddress"),
        city:       get(b, "City"),
        state:      get(b, "State"),
        zip:        get(b, "Zip"),
        lat:        parseFloat(get(b, "Latitude")) || null,
        lng:        parseFloat(get(b, "Longitude")) || null,
        status:     get(b, "Status"),
        price:      parseInt(get(b, "Price")) || 0,
        mlsId:      get(b, "MlsId"),
        listingUrl: get(b, "ListingUrl"),
        type:       get(b, "PropertyType"),
        beds:       parseInt(get(b, "Bedrooms")) || 0,
        baths:      parseFloat(get(b, "Bathrooms")) || 0,
        sqft:       parseInt(get(b, "LivingArea")) || 0,
        lotSize:    parseFloat(get(b, "LotSize")) || 0,
        yearBuilt:  parseInt(get(b, "YearBuilt")) || 0,
        photo:      getPic(b),
        agentFirst: get(b, "FirstName"),
        agentLast:  get(b, "LastName"),
        agentEmail: get(b, "Email"),
        agentPhone: get(b, "OfficeLineNumber"),
        office:     get(b, "OfficeName"),
      });
    }

    const { lat, lng, radius: r } = Object.fromEntries(new URL(req.url).searchParams);
    const radius = parseFloat(r) || 999999;

    const haversine = (a, b, c, d) => {
      const R = 3958.8, dLat = (c-a)*Math.PI/180, dLon = (d-b)*Math.PI/180;
      const h = Math.sin(dLat/2)**2 + Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dLon/2)**2;
      return R * 2 * Math.asin(Math.sqrt(h));
    };

    const filtered = (lat && lng)
      ? listings.filter(l => l.lat && l.lng && haversine(parseFloat(lat), parseFloat(lng), l.lat, l.lng) <= radius)
      : listings;

    return new Response(JSON.stringify({ listings: filtered, total: filtered.length, generatedAt: new Date().toISOString() }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Parse failed", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
