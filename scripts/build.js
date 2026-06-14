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

const avg = reviews.length > 0
  ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
  : 0;

const SITE = business.reviewsSiteUrl.replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);
const isSample = !!(store.meta && store.meta.sample);
const WRITE_REVIEW_URL = "https://g.page/r/Cc0tpw6mbLDJEBM/review";

const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const starSvg = (sz, color) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 8.9H23l-7.5 5.4 2.9 8.9L12 19.8l-6.4 5.4 2.9-8.9L1 10.9h8.1z"/></svg>`;

const googleStars = (rating, size) => {
  const sz = size === "lg" ? 28 : size === "md" ? 18 : 14;
  return `<span class="stars stars-${size}" role="img" aria-label="Rated ${rating} out of 5">` +
    [1,2,3,4,5].map(i => starSvg(sz, i <= rating ? "#FBBC04" : "#3a3f6e")).join("") +
  `</span>`;
};

const AVATAR_COLORS = ["#4285F4","#EA4335","#34A853","#FF6D00","#9C27B0","#00BCD4","#E91E63","#FF5722"];
const avatarColor = (name) => AVATAR_COLORS[(name || "?").charCodeAt(0) % AVATAR_COLORS.length];
const avatarInitial = (name) => (name || "?")[0].toUpperCase();
const avatar = (name) =>
  `<span class="avatar" style="background:${avatarColor(name)}" aria-hidden="true">${avatarInitial(name)}</span>`;

// JSON-LD
const jsonLd = {
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", business.category || "EntertainmentBusiness"],
  "@id": business.url + "/#business",
  name: business.name, url: business.url, description: business.description,
  priceRange: business.priceRange || undefined,
  telephone: business.telephone || undefined,
  address: { "@type": "PostalAddress", ...business.address },
  geo: business.geo ? { "@type": "GeoCoordinates", latitude: business.geo.latitude, longitude: business.geo.longitude } : undefined,
  sameAs: business.sameAs,
  aggregateRating: reviews.length > 0
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
  "@context": "https://schema.org", "@type": "WebPage",
  "@id": SITE + "/#webpage", url: SITE + "/",
  name: `${business.name} Reviews — Customer Ratings`,
  description: `Read ${reviews.length} verified customer reviews of ${business.name}. Average rating ${avg} out of 5.`,
  dateModified: today,
  about: { "@id": business.url + "/#business" },
  isPartOf: { "@type": "WebSite", url: SITE + "/", name: `${business.name} Reviews` },
};

const sourceLabel = { google: "Google", yelp: "Yelp" };

const reviewCards = reviews.map((r) => `
  <article class="card">
    <div class="card-header">
      ${avatar(r.author)}
      <div class="card-meta">
        <span class="author">${esc(r.author)}</span>
        ${r.date ? `<time datetime="${esc(r.date)}">${esc(fmtDate(r.date))}</time>` : ""}
      </div>
    </div>
    <div class="card-stars">${googleStars(r.rating, "sm")}</div>
    <p class="review-text">${esc(r.text)}</p>
  </article>`).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} Customers | Glendale, CA</title>
<meta name="description" content="${esc(`${business.name} customer reviews: rated ${avg} out of 5 from ${reviews.length} Google reviews. Interactive LED floor games, laser maze and more at Glendale Galleria, Los Angeles.`)}">
<meta name="google-site-verification" content="FGSr4hoKCs9wHegYrMHIvyoULIL0Qx-l1KDRJc8H7bs">
<link rel="canonical" href="${SITE}/">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(business.name)} Reviews — ${avg}★ from ${reviews.length} customers">
<meta property="og:description" content="${esc(business.description)}">
<meta property="og:url" content="${SITE}/">
<script type="application/ld+json">${JSON.stringify(cleanLd)}</script>
<script type="application/ld+json">${JSON.stringify(webPageLd)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #080c24;
  --bg2: #0d1235;
  --card-dark: #111638;
  --card-light: #ffffff;
  --border: #1e2550;
  --ink: #ffffff;
  --ink-dark: #14161A;
  --muted: #8890bb;
  --muted-dark: #5a6270;
  --red: #E8192C;
  --yellow: #FBBC04;
  --purple: #c653ff;
  --cyan: #00d4ff;
  --orange: #ff7a00;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* HEADER */
header.site {
  background: var(--red);
  position: sticky; top: 0; z-index: 100;
  box-shadow: 0 2px 20px rgba(232,25,44,0.4);
}
header.site .inner {
  max-width: 820px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 20px;
}
.logo {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700; font-size: 20px;
  color: #fff; text-decoration: none; letter-spacing: .04em;
}
.logo span { color: rgba(255,255,255,0.65); font-weight: 500; font-size: 14px; margin-left: 6px; }
.header-link {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700; font-size: 13px;
  color: #fff; text-decoration: none;
  letter-spacing: .1em; text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.45);
  padding: 6px 16px; border-radius: 4px;
  transition: background .15s;
}
.header-link:hover { background: rgba(255,255,255,0.15); }

/* HERO */
.hero {
  background: var(--bg2);
  padding: 52px 20px 44px;
  text-align: center;
  border-bottom: 1px solid var(--border);
  position: relative; overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(198,83,255,0.08) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 50%, rgba(0,212,255,0.08) 0%, transparent 60%);
  pointer-events: none;
}
.hero h1 {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: clamp(28px, 5vw, 42px);
  line-height: 1.2; color: #fff; margin-bottom: 32px;
  letter-spacing: .01em;
}
.hero h1 em { color: var(--yellow); font-style: normal; }

.score-block {
  display: inline-flex; align-items: center;
  gap: 24px; flex-wrap: wrap; justify-content: center;
  background: var(--card-dark);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px 40px;
  position: relative;
}
.score-block::before {
  content: '';
  position: absolute; inset: -1px; border-radius: 16px;
  background: linear-gradient(135deg, var(--purple), var(--cyan));
  z-index: -1; opacity: .4;
}
.score-num {
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 64px; line-height: 1;
  background: linear-gradient(135deg, var(--yellow), var(--orange));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.score-right { text-align: left; }
.stars { display: inline-flex; align-items: center; gap: 2px; }
.score-count {
  color: var(--muted); font-size: 13px; margin-top: 4px;
  font-family: 'Rajdhani', sans-serif; font-weight: 500; letter-spacing: .02em;
}

/* CARDS */
.wrap { max-width: 820px; margin: 0 auto; padding: 0 20px; }
main { padding: 32px 0 64px; }
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
@media (max-width: 620px) { .cards-grid { grid-template-columns: 1fr; } }

.card {
  background: var(--card-light);
  border: 1px solid #e0e3ee;
  border-radius: 12px;
  padding: 18px 20px;
  transition: box-shadow .2s;
}
.card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
.card-header {
  display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
}
.avatar {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 16px; color: #fff; flex-shrink: 0;
}
.card-meta { flex: 1; min-width: 0; }
.card-meta .author {
  display: block; font-family: 'Rajdhani', sans-serif;
  font-weight: 700; font-size: 15px; color: var(--ink-dark);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card-meta time { font-size: 12px; color: var(--muted-dark); }
.card-stars { margin-bottom: 10px; }
.review-text { font-size: 14px; color: #333; line-height: 1.6; }

/* CTA */
.cta {
  margin-top: 40px;
  background: var(--card-dark);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 36px 24px; text-align: center;
  position: relative; overflow: hidden;
}
.cta::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(251,188,4,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.cta h2 {
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: clamp(22px, 4vw, 30px);
  color: #fff; margin-bottom: 8px; letter-spacing: .02em;
}
.cta p { color: var(--muted); font-size: 15px; margin-bottom: 22px; }
.cta a.btn {
  display: inline-flex; align-items: center; gap: 10px;
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 16px; letter-spacing: .08em; text-transform: uppercase;
  color: #fff; text-decoration: none;
  padding: 13px 28px; border-radius: 8px;
  background: var(--red);
  box-shadow: 0 4px 20px rgba(232,25,44,0.4);
  transition: transform .15s, box-shadow .15s;
}
.cta a.btn:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(232,25,44,0.55); }

/* FOOTER */
footer.site {
  border-top: 1px solid var(--border);
  padding: 24px 0 40px;
  color: var(--muted); font-size: 13px; text-align: center;
}
footer.site a { color: var(--cyan); text-decoration: none; }

${isSample ? ".sample-note{background:#1a1200;border:1px solid #4a3800;border-radius:8px;padding:10px 14px;font-size:13px;color:#f0b429;margin-bottom:16px}" : ""}
</style>
</head>
<body>

<header class="site">
  <div class="inner">
    <a href="${esc(business.url)}" class="logo">
      PIXEL ROOMS <span>/ REVIEWS</span>
    </a>
    <a href="${esc(business.url)}" class="header-link" rel="noopener">Visit Site</a>
  </div>
</header>

<section class="hero">
  <div class="wrap">
    <h1>What our customers say about <em>Pixel Rooms</em></h1>
    <div class="score-block">
      <div class="score-num">${avg}</div>
      <div class="score-right">
        ${googleStars(Math.round(avg), "lg")}
        <p class="score-count">${reviews.length} verified Google reviews</p>
      </div>
    </div>
  </div>
</section>

<main class="wrap">
  ${isSample ? '<div class="sample-note">⚠ Sample data — run first sync to load real Google reviews.</div>' : ""}
  <div class="cards-grid">
    ${reviewCards}
  </div>
  <div class="cta">
    <h2>Visited Pixel Rooms?</h2>
    <p>Share your experience — it takes one minute and helps others discover us.</p>
    <a class="btn" href="${esc(WRITE_REVIEW_URL)}" target="_blank" rel="noopener">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/></svg>
      Write a Google Review
    </a>
  </div>
</main>

<footer class="site">
  <div class="wrap">
    <p>${esc(business.name)} · ${esc(business.address.streetAddress)}, ${esc(business.address.addressLocality)}, ${esc(business.address.addressRegion)} ${esc(business.address.postalCode)}</p>
    <p style="margin-top:6px">Google reviews updated daily · <a href="${esc(business.url)}">pixelrooms.com</a></p>
  </div>
</footer>
</body>
</html>
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
</urlset>`;

const robots = `User-agent: *\nAllow: /\nUser-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nSitemap: ${SITE}/sitemap.xml`;

const llms = `# ${business.name} Reviews\n\n> ${business.description}\n\nAverage customer rating: ${avg} / 5 from ${reviews.length} Google reviews.\nAddress: ${business.address.streetAddress}, ${business.address.addressLocality}, ${business.address.addressRegion} ${business.address.postalCode}, US.\nOfficial website: ${business.url}\n\n## Recent customer reviews\n\n${reviews.slice(0,25).map(r=>`- ${r.rating}/5 — "${r.text}" — ${r.author}, ${r.date}`).join("\n")}`;

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "index.html"), html);
fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(DIST, "robots.txt"), robots);
fs.writeFileSync(path.join(DIST, "llms.txt"), llms);
console.log(`Built dist/: ${reviews.length} reviews, avg ${avg}.${isSample?" (sample)":""}`);
