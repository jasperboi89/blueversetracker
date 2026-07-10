# BlueVerse Studio — website

A self-contained static site built to match the BlueVerse Studio design mockups.

## Pages
- **`index.html`** — the public BlueVerse Studio homepage (cinematic hero + card-grid dashboard).
- **`nexus.html`** — **The Nexus**, the private command-center dashboard.

The two pages link to each other ("The Nexus" / "Enter The Nexus" → dashboard; the top-left logo / "Nexus Home" → homepage).

## Run it
Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080 --directory site
# then visit http://localhost:8080/
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | Homepage markup |
| `nexus.html` | The Nexus dashboard markup |
| `styles.css` | Shared design tokens, glassmorphism, fonts + homepage styles |
| `nexus.css` | Dashboard-specific layout/styles (loads after `styles.css`) |
| `script.js` | Homepage interactions (tabs, focus timer, live clock, mock AI chat) |
| `nexus.js` | Dashboard interactions (sidebar state, mock actions, live signal) |
| `assets/design-reference-homepage.png` | Original homepage design reference; also used for the hero scene |

## Notes
- Fonts (Inter + Space Grotesk) load from Google Fonts; everything else is local.
- The homepage hero uses the reference mockup image for the cosmic-portal scene.
- The Nexus page is a faithful CSS recreation of its mockup (no source asset was provided for it).
- All data shown is illustrative/mock — this is the front-end. A future phase can wire real auth, storage, and AI backends.
