# MyTrainer

A personal workout + weight tracker for Adam & Char. Static site, no build step, deploys to GitHub Pages.

## URLs
- `/` — profile picker
- `/adam/` — Adam (blue theme)
- `/char/` — Char (pink theme)

## Structure
- `index.html` — picker
- `adam/`, `char/` — per-profile entry pages
- `app/app.js`, `app/styles.css` — the shared app
- `References/` — design reference screenshots (not required at runtime)

## Data
Stored in each device browser (localStorage), separate per profile. Use **More → Export backup** to save a JSON copy, and **Import backup** to restore or move to another device.

## Deploy to GitHub Pages
1. Create a new GitHub repo (e.g. `mytrainer`).
2. Push these files to the `main` branch.
3. Repo **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `/ (root)`.
4. Open `https://<username>.github.io/mytrainer/` and pick a profile.

On iPhone/Android open the profile URL, then **Add to Home Screen** to use it like an app.
