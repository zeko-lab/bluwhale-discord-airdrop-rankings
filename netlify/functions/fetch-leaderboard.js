/**
 * Netlify serverless function: fetch MEE6 + Engage + BluSub leaderboards,
 * merge by user_id / username, return merged list + MEE6 role_rewards.
 * BluSub data: fetched from same-origin /blusub-leaderboard.json (written by bot on host).
 */

const GUILD_ID = process.env.GUILD_ID || "1219528526386958397";
const MEE6_URL = `https://mee6.xyz/api/plugins/levels/leaderboard/${GUILD_ID}?limit=1000`;
const ENGAGE_BASE = "https://www.engages.io/api/community/leaderboard";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cached = null;
let cachedAt = 0;

function normalizeUsername(s) {
  if (s == null || typeof s !== "string") return "";
  return s.trim().toLowerCase();
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, ...options });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function fetchMee6() {
  const data = await fetchJson(MEE6_URL);
  return {
    players: data.players || [],
    roleRewards: data.role_rewards || [],
  };
}

// Fetch Engage in parallel batches to stay under Netlify's ~10s timeout.
// Max 50 pages (top ~500 users by points) to keep response time reasonable.
const ENGAGE_PAGE_BATCH = 10;
const ENGAGE_MAX_PAGES = 50;

async function fetchEngage() {
  const out = [];
  let pageKey = 0;
  let hasNext = true;
  while (hasNext && pageKey < ENGAGE_MAX_PAGES) {
    const batch = [];
    for (let i = 0; i < ENGAGE_PAGE_BATCH; i++) {
      const p = pageKey + i;
      if (p >= ENGAGE_MAX_PAGES) break;
      batch.push(
        fetchJson(
          `${ENGAGE_BASE}?guildId=${GUILD_ID}&pageKey=${p}&sortBy=points&sortOrder=desc`
        )
      );
    }
    const results = await Promise.all(batch);
    for (const data of results) {
      const list = data.leaderboard || [];
      out.push(...list);
    }
    const last = results[results.length - 1];
    hasNext = last && last.hasNextPage === true && last.leaderboard?.length > 0;
    pageKey += ENGAGE_PAGE_BATCH;
  }
  return out;
}

async function fetchBlusub(siteUrl) {
  const url = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/blusub-leaderboard.json`
    : null;
  if (!url) return [];
  try {
    const data = await fetchJson(url);
    return Array.isArray(data) ? data : data.users || data.leaderboard || [];
  } catch (_) {
    return [];
  }
}

function merge(mee6, engage, blusub) {
  const byId = new Map();
  const byUsername = new Map();

  function set(id, username, data) {
    const key = String(id);
    if (!byId.has(key)) {
      const rec = {
        user_id: key,
        username: username || "",
        mee6Xp: 0,
        mee6Level: 0,
        engagePoints: 0,
        blusubPoints: 0,
        mee6RoleNames: [],
        avatar: null,
      };
      byId.set(key, rec);
      const un = normalizeUsername(username);
      if (un) byUsername.set(un, rec);
    }
    const r = byId.get(key);
    Object.assign(r, data);
    if (data.username && !r.username) r.username = data.username;
    const un = normalizeUsername(data.username || username);
    if (un) byUsername.set(un, r);
  }

  for (const p of mee6.players) {
    const id = String(p.id);
    const username = p.username || "";
    const qualifying = (mee6.roleRewards || []).filter(
      (rr) => (p.level || 0) >= (rr.rank || 0)
    );
    const highest = qualifying.length
      ? qualifying.reduce((best, rr) => ((rr.rank || 0) > (best?.rank ?? -1) ? rr : best))
      : null;
    const roleNames = highest?.role?.name ? [highest.role.name] : [];
    set(id, username, {
      username,
      mee6Xp: p.xp || 0,
      mee6Level: p.level || 0,
      mee6RoleNames: roleNames,
      avatar: p.avatar ? `https://cdn.discordapp.com/avatars/${id}/${p.avatar}.png` : null,
    });
  }

  for (const e of engage) {
    const id = String(e.discordId || e.user_id || "");
    const username = e.discordName || e.username || "";
    const r = byId.get(id) || byUsername.get(normalizeUsername(username));
    if (r) {
      r.engagePoints = e.points ?? e.points_awarded ?? 0;
      if (e.avatarURL) r.avatar = e.avatarURL;
      if (username && !r.username) r.username = username;
    } else {
      set(id, username, {
        username,
        engagePoints: e.points ?? e.points_awarded ?? 0,
        avatar: e.avatarURL || null,
      });
    }
  }

  for (const b of blusub) {
    const id = String(b.user_id || b.userId || "");
    const username = b.username || "";
    const points = b.points ?? 0;
    const r = byId.get(id) || byUsername.get(normalizeUsername(username));
    if (r) {
      r.blusubPoints = points;
      if (username && !r.username) r.username = username;
    } else {
      set(id, username, { username, blusubPoints: points });
    }
  }

  return Array.from(byId.values());
}

exports.handler = async (event, context) => {
  const siteUrl = process.env.URL || process.env.NETLIFY_URL || "";
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    if (!cached.lastUpdated) cached.lastUpdated = cachedAt;
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify(cached),
    };
  }

  try {
    const [mee6Data, engageList, blusubList] = await Promise.all([
      fetchMee6(),
      fetchEngage(),
      fetchBlusub(siteUrl),
    ]);

    const users = merge(mee6Data, engageList, blusubList);
    const roleRewards = (mee6Data.roleRewards || []).map((rr) => ({
      rank: rr.rank,
      role: rr.role ? { id: rr.role.id, name: rr.role.name } : null,
    }));

    cached = { users, roleRewards, lastUpdated: now };
    cachedAt = now;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify(cached),
    };
  } catch (err) {
    console.error("fetch-leaderboard error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err.message) }),
    };
  }
};
