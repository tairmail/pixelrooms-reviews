#!/usr/bin/env node
/**
 * sync.js — pulls Google reviews and stores them locally in data/reviews.json.
 *
 * Source: Featurable API (free wrapper around the Google Business Profile API,
 * returns the full review set for a business you own — not just the 5 reviews
 * the Places API exposes).
 *
 * Setup: create a free widget at https://featurable.com, connect the
 * Pixel Rooms Google Business Profile, copy the widget ID, and set it as
 * the FEATURABLE_WIDGET_ID environment variable (GitHub Actions secret).
 *
 * Deduplication: reviews are keyed by a stable ID (Google review ID when
 * available, otherwise a hash of author + date + text). Existing reviews are
 * never deleted — if a review disappears upstream it stays in the local store,
 * which is what you want for SEO permanence.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE = path.join(DATA_DIR, "reviews.json");

const WIDGET_ID = process.env.FEATURABLE_WIDGET_ID;
if (!WIDGET_ID) {
  console.error("FEATURABLE_WIDGET_ID is not set. Aborting sync.");
  process.exit(1);
}

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function stableId(review) {
  if (review.reviewId) return `google:${review.reviewId}`;
  const basis = `${review.author}|${review.date}|${(review.text || "").slice(0, 80)}`;
  return "google:" + crypto.createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

function normalize(raw) {
  const rating =
    typeof raw.starRating === "number"
      ? raw.starRating
      : STAR_MAP[String(raw.starRating).toUpperCase()] || null;

  return {
    id: null, // filled below
    source: "google",
    author: (raw.reviewer && raw.reviewer.displayName) || raw.author || "Google user",
    rating,
    text: (raw.comment || raw.text || "").trim(),
    date: (raw.createTime || raw.updateTime || raw.date || "").slice(0, 10),
    reviewId: raw.reviewId || raw.id || null,
  };
}

async function main() {
  const url = `https://featurable.com/api/v1/widgets/${WIDGET_ID}`;
  console.log("Fetching reviews…");
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`Featurable API returned ${res.status}. Aborting without changes.`);
    process.exit(1);
  }
  const payload = await res.json();
  const incomingRaw = payload.reviews || [];
  console.log(`Fetched ${incomingRaw.length} reviews from Google.`);

  // Load existing store
  let store = { meta: {}, reviews: [] };
  if (fs.existsSync(STORE)) {
    try {
      store = JSON.parse(fs.readFileSync(STORE, "utf8"));
    } catch {
      console.warn("Existing reviews.json unreadable — starting fresh.");
    }
  }

  const byId = new Map();
  for (const r of store.reviews || []) byId.set(r.id, r);

  let added = 0;
  let updated = 0;
  for (const raw of incomingRaw) {
    const review = normalize(raw);
    if (!review.rating) continue; // skip malformed entries
    review.id = stableId(review);
    const existing = byId.get(review.id);
    if (!existing) {
      byId.set(review.id, review);
      added++;
    } else if (existing.text !== review.text || existing.rating !== review.rating) {
      byId.set(review.id, { ...existing, ...review }); // review was edited upstream
      updated++;
    }
  }

  const reviews = [...byId.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const rated = reviews.filter((r) => r.rating);
  const avg =
    rated.length > 0
      ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10
      : null;

  store = {
    meta: {
      lastSync: new Date().toISOString(),
      totalReviews: reviews.length,
      averageRating: avg,
      upstreamAverage: payload.averageRating || null,
      upstreamTotal: payload.totalReviewCount || null,
    },
    reviews,
  };

  fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + "\n");
  console.log(
    `Done. ${added} new, ${updated} updated, ${reviews.length} total. Average ${avg}.`
  );
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
