# Pixel Rooms Reviews — Setup Guide

A static, SEO-focused reviews site. Google reviews sync automatically every day; Yelp reviews are curated by hand (see "Why" below). Zero servers, zero database, zero monthly cost.

## Architecture

```
Google Business Profile ──► Featurable API (free) ──► GitHub Action (daily 6 AM)
                                                            │ commits data/reviews.json
                                                            ▼
                                                    Netlify auto-rebuild
                                                            ▼
                                            reviews.pixelrooms.com (static HTML)
```

Reviews are stored locally in `data/reviews.json` (committed to the repo), rendered as plain HTML with JSON-LD structured data, a sitemap, robots.txt and llms.txt. Nothing loads client-side — crawlers and LLMs see everything.

## One-time setup (~30 minutes)

### 1. Featurable (the review feed)
1. Go to featurable.com → sign up free with the Google account that manages the Pixel Rooms Business Profile.
2. Create a widget, connect the Pixel Rooms listing.
3. Copy the **Widget ID** from the embed code or API tab (a UUID-looking string).

### 2. GitHub
1. Create a private or public repo, e.g. `pixelrooms-reviews`. Public is fine — reviews are public data.
2. Upload this entire folder (or `git push` it).
3. Repo → Settings → Secrets and variables → Actions → **New repository secret**:
   - Name: `FEATURABLE_WIDGET_ID`
   - Value: the widget ID from step 1.
4. Repo → Actions tab → "Daily review sync" → **Run workflow** (manual first run). Confirm it commits an updated `data/reviews.json` with real reviews.

### 3. Netlify (hosting, free tier)
1. netlify.com → Add new site → Import from GitHub → pick the repo.
2. Build settings are auto-detected from `netlify.toml`. Deploy.
3. Site settings → Domain management → add custom domain `reviews.pixelrooms.com`.
4. In your DNS (wherever pixelrooms.com is registered): add a CNAME record `reviews` → your-site.netlify.app. SSL is automatic.

### 4. Google Search Console
1. search.google.com/search-console → Add property `reviews.pixelrooms.com` (DNS verification).
2. Sitemaps → submit `https://reviews.pixelrooms.com/sitemap.xml`.
3. URL Inspection → request indexing for the homepage.

Done. From here it runs itself: GitHub pulls reviews every morning, Netlify rebuilds on every commit, sitemap lastmod updates daily.

## Adding Yelp reviews
Edit `data/manual-reviews.json`, add entries:

```json
{ "id": "yelp:001", "source": "yelp", "author": "John D.", "rating": 5,
  "text": "Review text…", "date": "2026-05-01" }
```

Commit — Netlify rebuilds automatically. Keep excerpts short and always keep the "See us on Yelp" link (it's already on the page).

## Editing business details
Everything (address, phone, links, description) lives in `data/business.json`. Fill in `telephone`, the real `googleMapsUrl` (your Maps listing URL) and `yelpUrl` before launch — they are placeholders now.

## Local preview
```
node scripts/build.js
npx serve dist
```

## Why these constraints exist
- **Yelp**: the official API returns only 3 truncated excerpts and Yelp's ToS prohibits scraping (they litigate). Manual curation + outbound link is the only clean option.
- **Google**: the Places API returns only 5 reviews. The Business Profile API returns all of them but requires owner OAuth; Featurable wraps that for free, which is why it's the feed.
- **Review stars in Google search results**: Google's policy excludes "self-serving" review snippets and reviews copied from third-party platforms from rich results. The schema is still included because AI search engines (ChatGPT, Perplexity, Claude, Gemini) read structured data and page text directly — that's where this site earns its keep, plus long-tail queries like "pixel rooms reviews".

## Maintenance
None scheduled. If the sync ever fails (GitHub emails you), the site keeps serving the last good data — reviews are never deleted, only added.
