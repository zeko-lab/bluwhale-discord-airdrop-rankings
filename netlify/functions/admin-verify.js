/**
 * POST with { "password": "..." }. Returns 200 if body.password === ADMIN_SECRET, else 401.
 * Used by admin.html to gate access. Set ADMIN_SECRET in Netlify env.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "" };
  }
  const secret = process.env.ADMIN_SECRET || "";
  let body = {};
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
  } catch (_) {
    return { statusCode: 400, body: "" };
  }
  const ok = secret && secret.length > 0 && body.password === secret;
  return {
    statusCode: ok ? 200 : 401,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok }),
  };
};
