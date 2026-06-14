#!/usr/bin/env node
/**
 * build.js — generates the static site into dist/ from data/*.json.
 * No framework, no client-side JS. Everything is server-rendered HTML,
 * fully crawlable by search engines and AI crawlers.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const business = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "business.json"), "utf8"));
const store = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "reviews.json"), "utf8"));

let manual = { reviews: [] };
const manualPath = path.join(ROOT, "data", "manual-reviews.json");
if (fs.existsSync(manualPath)) {
  manual = JSON.parse(fs.readFileSync(manualPath, "utf8"));
}

// Merge + dedupe (manual entries flagged sample:true are excluded)
const byId = new Map();
for (const r of store.reviews || []) byId.set(r.id, r);
for (const r of manual.reviews || []) {
  if (r.sample) continue;
  if (!byId.has(r.id)) byId.set(r.id, r);
}
const reviews = [...byId.values()]
  .filter((r) => r.rating && r.text)
  .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

const avg =
  reviews.length > 0
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

const SITE = business.reviewsSiteUrl.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const isSample = !!(store.meta && store.meta.sample);

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const pixelStars = (rating, size) =>
  `<span class="stars stars-${size}" role="img" aria-label="Rated ${rating} out of 5">` +
  [1, 2, 3, 4, 5]
    .map((i) => `<span class="px${i <= rating ? " lit" : ""}"></span>`)
    .join("") +
  `</span>`;

// ---------- JSON-LD ----------
const jsonLd = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", business.category || "EntertainmentBusiness"],
  "@id": business.url + "/#business",
  name: business.name,
  url: business.url,
  description: business.description,
  priceRange: business.priceRange || undefined,
  telephone: business.telephone || undefined,
  address: { "@type": "PostalAddress", ...business.address },
  geo: business.geo
    ? { "@type": "GeoCoordinates", latitude: business.geo.latitude, longitude: business.geo.longitude }
    : undefined,
  sameAs: business.sameAs,
  aggregateRating:
    reviews.length > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: avg,
          reviewCount: reviews.length,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
  review: reviews.slice(0, 30).map((r) => ({
    "@type": "Review",
    author: { "@type": "Person", name: r.author },
    datePublished: r.date || undefined,
    reviewBody: r.text,
    reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
  })),
};
const cleanLd = JSON.parse(JSON.stringify(jsonLd)); // strip undefined

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": SITE + "/#webpage",
  url: SITE + "/",
  name: `${business.name} Reviews — Customer Ratings`,
  description: `Read ${reviews.length} verified customer reviews of ${business.name}. Average rating ${avg} out of 5.`,
  dateModified: today,
  about: { "@id": business.url + "/#business" },
  isPartOf: { "@type": "WebSite", url: SITE + "/", name: `${business.name} Reviews` },
};

// ---------- HTML ----------
const sourceLabel = { google: "Google", yelp: "Yelp" };

const reviewCards = reviews
  .map(
    (r) => `
    <article class="card">
      <div class="card-top">
        ${pixelStars(r.rating, "sm")}
        <span class="badge badge-${esc(r.source)}">${esc(sourceLabel[r.source] || r.source)}</span>
      </div>
      <p class="review-text">${esc(r.text)}</p>
      <footer class="card-meta">
        <span class="author">${esc(r.author)}</span>
        ${r.date ? `<time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>` : ""}
      </footer>
    </article>`
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} Customers | Glendale, CA</title>
<meta name="description" content="${esc(
  `${business.name} customer reviews: rated ${avg} out of 5 from ${reviews.length} reviews. Interactive LED floor games, laser maze and more at Glendale Galleria, Los Angeles.`
)}">
<link rel="canonical" href="${SITE}/">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} customers">
<meta property="og:description" content="${esc(business.description)}">
<meta property="og:url" content="${SITE}/">
<meta property="og:site_name" content="${esc(business.name)} Reviews">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(cleanLd)}</script>
<script type="application/ld+json">${JSON.stringify(webPageLd)}</script>
<style>
:root{
  --bg:#FAFBFD; --ink:#14161A; --muted:#5A6270; --card:#FFFFFF; --line:#E7EAF0;
  --px-off:#E3E7EE; --led-a:#00D4FF; --led-b:#FF3DA6;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.display{font-family:"Space Grotesk",sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;gap:10px;padding-top:14px;padding-bottom:14px}
.glyph{display:grid;grid-template-columns:repeat(2,7px);grid-template-rows:repeat(2,7px);gap:2px}
.glyph i{border-radius:1.5px;background:linear-gradient(135deg,var(--led-a),var(--led-b))}
.glyph i:nth-child(3){background:var(--px-off)}
.brand{font-family:"Space Grotesk",sans-serif;font-weight:700;letter-spacing:.04em;font-size:15px}
.brand span{color:var(--muted);font-weight:500}
.hero{text-align:center;padding:56px 0 40px}
.hero h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:clamp(26px,5vw,38px);line-height:1.15;letter-spacing:-.01em}
.score{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:clamp(56px,12vw,84px);line-height:1;margin-top:24px;background:linear-gradient(110deg,var(--led-a),var(--led-b));-webkit-background-clip:text;background-clip:text;color:transparent}
.stars{display:inline-flex;gap:5px;vertical-align:middle}
.stars .px{width:18px;height:18px;border-radius:4px;background:var(--px-off)}
.stars .px.lit{background:linear-gradient(135deg,var(--led-a),var(--led-b));box-shadow:0 1px 6px rgba(0,180,255,.35)}
.stars-sm .px{width:12px;height:12px;border-radius:3px}
.hero .stars{margin:16px 0 10px}
@media (prefers-reduced-motion:no-preference){
  .hero .px.lit{animation:lightup .4s ease backwards}
  .hero .px.lit:nth-child(2){animation-delay:.07s}.hero .px.lit:nth-child(3){animation-delay:.14s}
  .hero .px.lit:nth-child(4){animation-delay:.21s}.hero .px.lit:nth-child(5){animation-delay:.28s}
  @keyframes lightup{from{background:var(--px-off);box-shadow:none}}
}
.count{color:var(--muted);font-size:15px}
.sources{margin-top:22px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.sources a{font-size:14px;color:var(--ink);text-decoration:none;border:1px solid var(--line);background:var(--card);padding:8px 16px;border-radius:99px}
.sources a:hover{border-color:var(--ink)}
main{padding-bottom:64px}
.section-label{font-family:"Space Grotesk",sans-serif;font-weight:500;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:8px 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:14px}
.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.badge{font-size:12px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:2px 10px}
.review-text{font-size:16px}
.card-meta{margin-top:12px;font-size:13.5px;color:var(--muted)}
.card-meta .author{font-weight:600;color:var(--ink)}
.card-meta time::before{content:"·";margin:0 6px}
.cta{margin-top:36px;text-align:center;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:28px 22px}
.cta p{color:var(--muted);font-size:15px;margin:6px 0 16px}
.cta a.btn{display:inline-block;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:15px;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;background:linear-gradient(110deg,var(--led-a),var(--led-b))}
footer.site{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--muted);font-size:13.5px;text-align:center}
footer.site a{color:var(--ink)}
:focus-visible{outline:2px solid var(--led-a);outline-offset:2px}
${isSample ? ".sample-note{background:#FFF6E5;border:1px solid #F1DCAE;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:18px}" : ""}
</style>
</head>
<body>
<header class="site">
  <div class="wrap">
    <span class="glyph" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span class="brand">PIXEL ROOMS <span>/ Reviews</span></span>
  </div>
</header>

<section class="hero wrap">
  <h1>What customers say about ${esc(business.name)}</h1>
  <div class="score">${avg}</div>
  ${pixelStars(Math.round(avg), "lg")}
  <p class="count">${reviews.length} verified customer reviews · Glendale Galleria, Los Angeles</p>
  <nav class="sources" aria-label="Review platforms">
    <a href="${esc(business.googleMapsUrl)}" rel="noopener">See us on Google</a>
    ${business.yelpUrl ? `<a href="${esc(business.yelpUrl)}" rel="noopener">See us on Yelp</a>` : ""}
    <a href="${esc(business.url)}" rel="noopener">Visit pixelrooms.com</a>
  </nav>
</section>

<main class="wrap">
  ${isSample ? '<div class="sample-note">Sample data shown — run the first sync to load real Google reviews.</div>' : ""}
  <h2 class="section-label">All reviews</h2>
  ${reviewCards}
  <div class="cta">
    <h2 class="display" style="font-size:20px">Been to Pixel Rooms?</h2>
    <p>Your review helps other visitors and takes one minute.</p>
    <a class="btn" href="${esc(business.googleMapsUrl)}" rel="noopener">Write a Google review</a>
  </div>
</main>

<footer class="site">
  <div class="wrap">
    <p>${esc(business.name)} · ${esc(business.address.streetAddress)}, ${esc(business.address.addressLocality)}, ${esc(business.address.addressRegion)} ${esc(business.address.postalCode)}</p>
    <p>Reviews sourced from Google. Last updated ${esc(fmtDate(today))}. <a href="${esc(business.url)}">pixelrooms.com</a></p>
  </div>
</footer>
</body>
</html>
`;

// ---------- sitemap / robots / llms.txt ----------
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
</urlset>
`;

const robots = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;

const llms = `# ${business.name} Reviews

> ${business.description}

Average customer rating: ${avg} / 5 from ${reviews.length} Google reviews.
Address: ${business.address.streetAddress}, ${business.address.addressLocality}, ${business.address.addressRegion} ${business.address.postalCode}, US.
Official website: ${business.url}

## Recent customer reviews

${reviews
  .slice(0, 25)
  .map((r) => `- ${r.rating}/5 — "${r.text}" — ${r.author}, ${r.date} (${sourceLabel[r.source] || r.source})`)
  .join("\n")}
`;

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "index.html"), html);
fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(DIST, "robots.txt"), robots);
fs.writeFileSync(path.join(DIST, "llms.txt"), llms);

console.log(`Built dist/: ${reviews.length} reviews, average ${avg}.${isSample ? " (sample data)" : ""}`);
