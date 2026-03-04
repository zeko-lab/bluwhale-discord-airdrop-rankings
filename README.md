# Bluwhale Airdrop Leaderboard (Netlify)

Combined leaderboard from **MEE6**, **Engage**, and **BluSub** submission points. Deploy to Netlify and optionally push the repo to [zeko-lab/bluwhale-discord-airdrop-rankings](https://github.com/zeko-lab/bluwhale-discord-airdrop-rankings).

## Deploy on Netlify

1. In Netlify: **Add new site** → **Import an existing project** → connect GitHub.
2. Pick the repo that contains this folder:
   - If this folder is the **root** of its repo: set **Base directory** to empty, **Publish directory** to `public`, **Functions directory** to `netlify/functions`.
   - If this folder lives **inside** another repo (e.g. `netlify-airdrop/`): set **Base directory** to `netlify-airdrop`, **Publish directory** to `public`.
3. **Environment variables** (Site settings → Environment variables):
   - `GUILD_ID` = `1219528526386958397` (optional; default is already set in the function).
4. Deploy. Your site URL will be like `https://something.netlify.app`.

The function fetches **BluSub** data from the same site at `/blusub-leaderboard.json`. That file is in `public/blusub-leaderboard.json` and is updated by the Discord bot (see below).

## Updating BluSub leaderboard data

On the **host where the Discord bot runs**:

1. Run the slash command: **`/export_airdrop_leaderboard`** (admin only).
2. The bot writes `netlify-airdrop/public/blusub-leaderboard.json` with current submission points and usernames.
3. Commit and push that file to the repo; Netlify will redeploy and the leaderboard will show the new data (within the 1-hour cache, or on next deploy).

## Config (role bonuses, weights)

- **Public leaderboard**: `public/airdrop-config.json` — edit `weight_engage`, `weight_blusub`, `mee6RoleBonuses`, `specialRoles`.
- **Admin UI**: open `/admin.html` on your site to edit config and **Copy JSON** or **Download airdrop-config.json**; then replace `public/airdrop-config.json` in the repo and redeploy.

## Local preview

**Run from the `netlify-airdrop` folder** (so Netlify finds `netlify.toml` and serves `public/`):

```bash
cd netlify-airdrop
npx netlify dev
```

Then open the URL shown (e.g. http://localhost:8888). The function will run locally; MEE6 and Engage are fetched live; BluSub uses `public/blusub-leaderboard.json`. If you run from the parent folder (blusub root), Netlify won’t use the right publish directory—always `cd netlify-airdrop` first.
