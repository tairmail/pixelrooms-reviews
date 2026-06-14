#!/usr/bin/env node
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

// Google Maps style yellow stars
const starSvg = (sz, color) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 8.9H23l-7.5 5.4 2.9 8.9L12 19.8l-6.4 5.4 2.9-8.9L1 10.9h8.1z"/></svg>`;

const googleStars = (rating, size) => {
  const sz = size === "lg" ? 26 : size === "md" ? 18 : 14;
  return `<span class="stars stars-${size}" role="img" aria-label="Rated ${rating} out of 5">` +
    [1,2,3,4,5].map(i => starSvg(sz, i <= rating ? "#FBBC04" : "#E0E0E0")).join("") +
  `</span>`;
};

// Avatar: coloured circle with initial, Google Maps style
const AVATAR_COLORS = ["#4285F4","#EA4335","#34A853","#FF6D00","#9C27B0","#00BCD4","#795548","#607D8B"];
const avatarColor = (name) => AVATAR_COLORS[(name || "?").charCodeAt(0) % AVATAR_COLORS.length];
const avatarInitial = (name) => (name || "?")[0].toUpperCase();
const avatar = (name) =>
  `<span class="avatar" style="background:${avatarColor(name)}" aria-hidden="true">${avatarInitial(name)}</span>`;

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
      ? { "@type": "AggregateRating", ratingValue: avg, reviewCount: reviews.length, bestRating: 5, worstRating: 1 }
      : undefined,
  review: reviews.slice(0, 30).map((r) => ({
    "@type": "Review",
    author: { "@type": "Person", name: r.author },
    datePublished: r.date || undefined,
    reviewBody: r.text,
    reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
  })),
};
const cleanLd = JSON.parse(JSON.stringify(jsonLd));

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

// ---------- Review cards ----------
const sourceLabel = { google: "Google", yelp: "Yelp" };

const reviewCards = reviews
  .map((r) => `
    <article class="card">
      <div class="card-header">
        ${avatar(r.author)}
        <div class="card-meta">
          <span class="author">${esc(r.author)}</span>
          ${r.date ? `<time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>` : ""}
        </div>
        <span class="badge badge-${esc(r.source)}" title="${esc(sourceLabel[r.source] || r.source)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        </span>
      </div>
      <div class="card-stars">${googleStars(r.rating, "sm")}</div>
      <p class="review-text">${esc(r.text)}</p>
    </article>`)
  .join("\n");

// ---------- HTML ----------
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} Customers | Glendale, CA</title>
<meta name="description" content="${esc(`${business.name} customer reviews: rated ${avg} out of 5 from ${reviews.length} Google reviews. Interactive LED floor games, laser maze and more at Glendale Galleria, Los Angeles.`)}">
<link rel="canonical" href="${SITE}/">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} customers">
<meta property="og:description" content="${esc(business.description)}">
<meta property="og:url" content="${SITE}/">
<meta property="og:site_name" content="${esc(business.name)} Reviews">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(cleanLd)}</script>
<script type="application/ld+json">${JSON.stringify(webPageLd)}</script>
<style>
:root{
  --bg:#F8F9FA; --ink:#202124; --muted:#70757A; --card:#FFFFFF;
  --line:#DADCE0; --blue:#1A73E8; --star:#FBBC04;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:15px/1.6 Roboto,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:700px;margin:0 auto;padding:0 20px}

/* Header */
header.site{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}
header.site .wrap{display:flex;align-items:center;gap:10px;padding:12px 20px}
.glyph{display:grid;grid-template-columns:repeat(2,7px);grid-template-rows:repeat(2,7px);gap:2px}
.glyph i{border-radius:1.5px}
.glyph i:nth-child(1){background:#4285F4}
.glyph i:nth-child(2){background:#EA4335}
.glyph i:nth-child(3){background:#FBBC04}
.glyph i:nth-child(4){background:#34A853}
.brand{font-family:"Google Sans",sans-serif;font-weight:500;font-size:16px;color:var(--ink)}
.brand span{color:var(--muted);font-weight:400}

/* Hero */
.hero{background:var(--card);border-bottom:1px solid var(--line);padding:32px 20px 28px;text-align:center}
.hero h1{font-family:"Google Sans",sans-serif;font-weight:700;font-size:clamp(22px,4vw,30px);color:var(--ink);margin-bottom:20px}
.score-row{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
.score{font-family:"Google Sans",sans-serif;font-weight:700;font-size:64px;line-height:1;color:var(--ink)}
.score-right{text-align:left}
.stars.stars-lg{display:flex;gap:3px;margin-bottom:4px}
.count{color:var(--muted);font-size:14px}
.sources{margin-top:20px;display:flex;justify-content:center;gap:10px;flex-wrap:wrap}
.sources a{font-size:14px;color:var(--blue);text-decoration:none;border:1px solid var(--line);background:var(--card);padding:7px 18px;border-radius:20px;font-family:"Google Sans",sans-serif;font-weight:500;transition:background .15s}
.sources a:hover{background:#F1F3F4}

/* Cards */
main{padding:16px 0 64px}
.section-label{font-family:"Google Sans",sans-serif;font-weight:500;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:8px 0 12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:12px}
.card-header{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.avatar{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:"Google Sans",sans-serif;font-weight:700;font-size:17px;color:#fff;flex-shrink:0}
.card-meta{flex:1;min-width:0}
.card-meta .author{display:block;font-family:"Google Sans",sans-serif;font-weight:500;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-meta time{font-size:13px;color:var(--muted)}
.badge{margin-left:auto;flex-shrink:0;opacity:.85}
.card-stars{display:flex;align-items:center;gap:2px;margin-bottom:10px}
.stars{display:inline-flex;align-items:center}
.review-text{font-size:15px;color:var(--ink);line-height:1.55}

/* CTA */
.cta{margin-top:28px;text-align:center;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:28px 22px}
.cta h2{font-family:"Google Sans",sans-serif;font-weight:700;font-size:20px;color:var(--ink);margin-bottom:8px}
.cta p{color:var(--muted);font-size:15px;margin-bottom:18px}
.cta a.btn{display:inline-flex;align-items:center;gap:8px;font-family:"Google Sans",sans-serif;font-weight:500;font-size:15px;color:#fff;text-decoration:none;padding:10px 22px;border-radius:24px;background:var(--blue)}
.cta a.btn:hover{background:#1558B0}

/* Footer */
footer.site{border-top:1px solid var(--line);padding:20px 0 36px;color:var(--muted);font-size:13px;text-align:center}
footer.site a{color:var(--blue);text-decoration:none}

${isSample ? ".sample-note{background:#FFF6E5;border:1px solid #F1DCAE;border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:14px}" : ""}
</style>
</head>
<body>

<header class="site">
  <div class="wrap">
    <span class="glyph" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span class="brand">Pixel Rooms <span>/ Reviews</span></span>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <h1>What customers say about ${esc(business.name)}</h1>
    <div class="score-row">
      <div class="score">${avg}</div>
      <div class="score-right">
        ${googleStars(Math.round(avg), "lg")}
        <p class="count">${reviews.length} verified Google reviews</p>
      </div>
    </div>
    <nav class="sources" aria-label="Review platforms">
      <a href="${esc(business.googleMapsUrl)}" rel="noopener">See us on Google</a>
      <a href="${esc(business.url)}" rel="noopener">Visit pixelrooms.com</a>
    </nav>
  </div>
</section>

<main class="wrap">
  ${isSample ? '<div class="sample-note">Sample data — run first sync to load real Google reviews.</div>' : ""}
  <h2 class="section-label">All reviews</h2>
  ${reviewCards}
  <div class="cta">
    <h2>Been to Pixel Rooms?</h2>
    <p>Your review helps other visitors and takes one minute.</p>
    <a class="btn" href="${esc(business.googleMapsUrl)}" rel="noopener">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/></svg>
      Write a Google review
    </a>
  </div>
</main>

<footer class="site">
  <div class="wrap">
    <p>${esc(business.name)} · ${esc(business.address.streetAddress)}, ${esc(business.address.addressLocality)}, ${esc(business.address.addressRegion)} ${esc(business.address.postalCode)}</p>
    <p>Google reviews updated daily. <a href="${esc(business.url)}">pixelrooms.com</a></p>
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
