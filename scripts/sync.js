#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE = path.join(DATA_DIR, "reviews.json");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("Missing credentials"); process.exit(1);
}

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }
    }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(JSON.parse(d))); });
    req.on("error", reject); req.write(body); req.end();
  });
}

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + (u.search || ""), method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { console.error("Response:", d.slice(0,200)); reject(e); } }); });
    req.on("error", reject); req.end();
  });
}

async function getAccessToken() {
  const result = await httpsPost("https://oauth2.googleapis.com/token", {
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN, grant_type: "refresh_token"
  });
  if (!result.access_token) { console.error("Token error:", JSON.stringify(result)); process.exit(1); }
  return result.access_token;
}

async function getAccountId(token) {
  const data = await httpsGet("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
  if (!data.accounts || data.accounts.length === 0) { console.error("No accounts:", JSON.stringify(data)); process.exit(1); }
  return data.accounts[0].name;
}

async function getLocationName(token, accountId) {
  const data = await httpsGet(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title`,
    token
  );
  if (!data.locations || data.locations.length === 0) { console.error("No locations:", JSON.stringify(data)); process.exit(1); }
  const loc = data.locations.find(l => (l.title || "").toLowerCase().includes("pixel")) || data.locations[0];
  console.log(`Using location: ${loc.title} (${loc.name})`);
  // loc.name = "accounts/xxx/locations/yyy" — extract just the location ID part
  return loc.name;
}

async function getAllReviews(token, locationName) {
  // New API endpoint: https://mybusiness.googleapis.com/v4/{locationName}/reviews
  // locationName format: accounts/xxx/locations/yyy
  const reviews = [];
  let pageToken = null;
  do {
    const qs = `pageSize=50${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?${qs}`;
    console.log(`Fetching: ${url}`);
    const data = await httpsGet(url, token);
    if (data.error) {
      console.error("Reviews error:", JSON.stringify(data.error));
      // Try alternative endpoint
      console.log("Trying alternative endpoint...");
      const url2 = `https://mybusinessreviews.googleapis.com/v1/${locationName}/reviews?${qs}`;
      const data2 = await httpsGet(url2, token);
      if (data2.error) { console.error("Alt error:", JSON.stringify(data2.error)); process.exit(1); }
      for (const r of data2.reviews || []) reviews.push(r);
      pageToken = data2.nextPageToken || null;
    } else {
      for (const r of data.reviews || []) reviews.push(r);
      pageToken = data.nextPageToken || null;
    }
    console.log(`Fetched ${reviews.length} reviews so far...`);
  } while (pageToken);
  return reviews;
}

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function normalize(raw) {
  const rating = STAR_MAP[String(raw.starRating || "").toUpperCase()] || null;
  const reviewId = raw.reviewId || raw.name;
  return {
    id: `google:${reviewId}`,
    source: "google",
    author: (raw.reviewer && raw.reviewer.displayName) || "Google user",
    rating,
    text: (raw.comment || "").trim(),
    date: (raw.createTime || raw.updateTime || "").slice(0, 10),
    reviewId,
  };
}

async function main() {
  console.log("Getting access token...");
  const token = await getAccessToken();
  console.log("Getting account...");
  const accountId = await getAccountId(token);
  console.log(`Account: ${accountId}`);
  console.log("Getting location...");
  const locationName = await getLocationName(token, accountId);
  console.log("Fetching all reviews...");
  const incomingRaw = await getAllReviews(token, locationName);
  console.log(`Total fetched: ${incomingRaw.length} reviews`);

  let store = { meta: {}, reviews: [] };
  if (fs.existsSync(STORE)) { try { store = JSON.parse(fs.readFileSync(STORE, "utf8")); } catch {} }

  const byId = new Map();
  for (const r of store.reviews || []) byId.set(r.id, r);
  let added = 0, updated = 0;
  for (const raw of incomingRaw) {
    const review = normalize(raw);
    if (!review.rating) continue;
    const existing = byId.get(review.id);
    if (!existing) { byId.set(review.id, review); added++; }
    else if (existing.text !== review.text || existing.rating !== review.rating) {
      byId.set(review.id, { ...existing, ...review }); updated++;
    }
  }

  const reviews = [...byId.values()].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const rated = reviews.filter(r => r.rating);
  const avg = rated.length > 0 ? Math.round((rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10) / 10 : null;

  store = { meta: { lastSync: new Date().toISOString(), totalReviews: reviews.length, averageRating: avg }, reviews };
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + "\n");
  console.log(`Done. ${added} new, ${updated} updated, ${reviews.length} total. Average: ${avg}`);
}

main().catch(err => { console.error("Sync failed:", err.message); process.exit(1); });
