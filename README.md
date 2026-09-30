# Memory Map — prototype

An embeddable, bilingual (DE/EN) map of places of remembrance: pins with hover preview cards, a detail panel, country and category filters, search, clustering, and step-by-step educational routes.

It is **one self-contained component** (plain HTML/CSS/JS on Leaflet), so the same embed code works on **WordPress now** and **Webflow later**. You own the code (this repo) and the data (a spreadsheet).

Demo data: Hungary and Slovakia (Budapest, Bratislava, Banská Bystrica) with one walking route per capital. **Texts, years, and coordinates are illustrative and must be verified before real use.**

---

## How it works

```
Google Sheet (client edits)  ──CSV──►  memory-map.js (GitHub Pages)  ──embed──►  WordPress / Webflow page
```

| File | What it is |
|---|---|
| `map/memory-map.js` | The component. Categories, countries and UI texts are at the top of the file. |
| `map/memory-map.css` | All styling, prefixed `.dm-` so it can't clash with the site theme. Colors/height are CSS variables at the top. |
| `data/locations.csv` | One row per place. |
| `data/routes.csv` | One row per route; `stops` = location ids separated by `\|`, in walking order. |
| `index.html` | Demo page. |
| `embed-snippet.html` | What you paste into WordPress / Webflow. |

### Data columns

**locations.csv:** `id, country, lat, lng, category, year, title_de, title_en, text_de, text_en, address, image_url, link`

- `id`: unique, no spaces (e.g. `sk-slavin`). Routes and share links use it.
- `country`: ISO code (`AT`, `HU`, `SK`…). All Danube-region codes are already configured.
- `lat` / `lng`: decimal (right-click a place in Google Maps to copy them). Comma or dot both work.
- `category`: one of `denkmal`, `gedenkstaette`, `gedenktafel`, `stein`, `gebaeude`, `museum` (add more in `CATEGORIES` in the JS).
- `image_url`: optional. Without it, a colored placeholder is shown.
- Rows with a missing id or invalid coordinates are **skipped** (with a console warning) instead of breaking the map.

**routes.csv:** `id, title_de, title_en, intro_de, intro_en, stops`

### Features
- **Hover** a pin → animated preview card. **Click** → detail panel + map flies to the place.
- **Phones:** 1st tap = preview, 2nd tap = details in a bottom sheet (phones have no hover).
- Filters: country, category chips, text search; pin clustering when zoomed out.
- **Routes:** numbered pins, animated route line, "Stop 2 of 4", Back/Next, a clickable stop list, and "open whole route in Google Maps" (walking).
- DE/EN toggle; share links (`#loc=sk-slavin`, `#route=budapest`) when `data-deeplinks` is set.
- Respects "reduced motion"; markers are keyboard-focusable.

---

## Run locally

CSV loading needs a local server (opening the file directly won't work):

```bash
cd memory-map
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish to GitHub Pages (≈5 minutes)

1. Create a new **public** repo on GitHub named `memory-map`.
2. From this folder:
   ```bash
   git add -A
   git commit -m "Memory map prototype"
   git remote add origin https://github.com/YOUR-GITHUB-USER/memory-map.git
   git push -u origin main
   ```
3. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `root` → Save.
4. After ~1 minute it's live at `https://YOUR-GITHUB-USER.github.io/memory-map/`. Send that link to the client as the demo.

Every `git push` updates the live map and every site that embeds it.

## Switch data to a Google Sheet (for the client to edit)

1. Google Sheets → **File → Import** → upload `data/locations.csv` (tab 1) and `data/routes.csv` (tab 2). These CSVs are the template.
2. **File → Share → Publish to web** → choose the tab → **CSV** → Publish → copy the link. Repeat for the second tab.
3. Put those links into `data-locations` / `data-routes` in the embed.
4. Optional: add Data validation on `category` and `country` (dropdowns) so editors can't mistype them.

Notes: a published sheet is public (fine, since the content is public anyway), and Google takes up to ~5 minutes to show edits.

## Embed

- **WordPress:** add a **Custom HTML** block → paste `embed-snippet.html` (after replacing `YOUR-GITHUB-USER`).
- **Webflow:** add an **Embed** element → paste the same snippet. Nothing else changes.
- Options on the `<div data-memory-map>`: `data-lang="de|en"`, `data-deeplinks`, `data-tiles` / `data-attribution` (different basemap).
- Size/colors: override CSS variables, e.g. `.dm-root { --dm-height: 720px; --dm-route: #0a5; }`.

---

## Before production: checklist

- [ ] **Basemap:** the demo uses CARTO's free tiles. For a public production site, get a free key from MapTiler or Stadia Maps and check their terms. It's a one-line change (`data-tiles`).
- [ ] **GDPR:** the map loads tiles and libraries from third-party servers, which see visitor IP addresses. Either mention it in the privacy policy, or self-host the three libraries in this repo (easy). Tiles always come from a tile provider.
- [ ] **Real content:** verified texts in DE and EN, coordinates, and **photos with usage rights and credits**.
- [ ] Brand styling (fonts come from the site; colors via CSS variables).
- [ ] Test inside the real WordPress theme (theme CSS or caching/optimization plugins can interfere with scripts).

---

## Estimating: what's left after this prototype

The core component is done. Remaining work for a production version, roughly:

| Task | Hours |
|---|---|
| Brand styling + design polish (pins, cards, panel) | 4–6 |
| Google Sheet setup, validation, 1-page editor guide | 2–3 |
| Import/check the client's real data (depends on their data quality) | 2–4 |
| Images: hosting, sizes, credits line | 1–2 |
| Production basemap key, GDPR self-hosting of libraries | 1–2 |
| WordPress embed + cross-browser/mobile testing in their theme | 2–3 |
| Client feedback rounds | 3–5 |
| **Phase 1 + routes, production-ready** | **≈15–25** |
| Webflow move later | ≈1 |
| Optional: accessible list view (all places as a list next to the map) | 3–5 |
| Optional: real walking paths instead of straight route lines | 3–4 |
| Optional: "suggest a place" form, moderated | 2–4 |

**The biggest unknown is content, not code.** Researching and writing bilingual texts and getting photo rights is usually the client's job. Say so explicitly in the offer.

## Questions to raise with the client now

1. **Who produces the content** (texts DE/EN, coordinates, photos with rights), and who maintains it later?
2. **Scale:** how many places at launch and after one year? How many countries and categories? (Many categories = a crowded filter bar on phones.)
3. **Languages:** DE/EN only, or local languages (HU, SK…) too? Local place names?
4. **Pins:** only their team adds pins (current setup), or should the public be able to *suggest* places?
5. **Routes:** are straight lines between stops OK, or do they need real walking paths? Printable route sheets for school classes?
6. **SEO:** is it OK that places live inside the map (no separate page per place)? If each place needs its own page, that's CMS work and a bigger budget.
7. **Accessibility:** do they have a public-funding accessibility requirement (WCAG)? If yes, plan the list view.
8. **Privacy:** OK to use an external basemap provider (mention in the privacy policy)?
