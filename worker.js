/* DermaTakip API. Secrets are set in Cloudflare, never committed to Git. */
const encoder = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const id = () => crypto.randomUUID();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (value) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function passwordHash(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, material, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function session(user, env) {
  const body = btoa(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  return `${body}.${await sign(body, env.SESSION_SECRET)}`;
}
async function current(request, env) {
  const token = (request.headers.get("cookie") || "").match(/(?:^|; )dt_session=([^;]+)/)?.[1];
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || signature !== await sign(body, env.SESSION_SECRET)) return null;
  const payload = JSON.parse(atob(body));
  if (payload.exp < Date.now()) return null;
  return env.DB.prepare("SELECT id, full_name, email, role FROM users WHERE id=? AND active=1").bind(payload.id).first();
}
function requires(user, role = null) { return user && (!role || user.role === role); }
async function body(request) { try { return await request.json(); } catch { return {}; } }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.SESSION_SECRET) return json({ error: "Sunucu kurulumu tamamlanmadı." }, 503);
    const user = await current(request, env);

    if (url.pathname === "/api/login" && request.method === "POST") {
      const { email, password } = await body(request);
      const found = await env.DB.prepare("SELECT * FROM users WHERE email=? AND active=1").bind(String(email || "").toLowerCase()).first();
      const candidate = found ? await passwordHash(String(password || ""), unb64(found.password_salt)) : null;
      if (!found || candidate.hash !== found.password_hash) return json({ error: "E-posta veya şifre hatalı." }, 401);
      return new Response(JSON.stringify({ user: { full_name: found.full_name, role: found.role } }), { headers: { "content-type": "application/json", "set-cookie": `dt_session=${await session(found, env)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` } });
    }
    if (url.pathname === "/api/logout" && request.method === "POST") return new Response(null, { status: 204, headers: { "set-cookie": "dt_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" } });
    if (url.pathname === "/api/me") return user ? json({ user }) : json({ error: "Giriş gerekli." }, 401);
    if (!user) return json({ error: "Giriş gerekli." }, 401);

    if (url.pathname === "/api/customers" && request.method === "GET") return json({ customers: (await env.DB.prepare("SELECT id, full_name, phone, skin_type, created_at FROM customers ORDER BY updated_at DESC LIMIT 100").all()).results });
    if (url.pathname === "/api/customers" && request.method === "POST") {
      const data = await body(request); if (!data.full_name) return json({ error: "Ad soyad zorunlu." }, 400);
      const customer = { id: id(), full_name: String(data.full_name).slice(0,120), phone: String(data.phone || "").slice(0,30), skin_type: String(data.skin_type || "").slice(0,40), notes: String(data.notes || "").slice(0,2000) };
      await env.DB.prepare("INSERT INTO customers(id,full_name,phone,skin_type,notes,created_by) VALUES(?,?,?,?,?,?)").bind(customer.id,customer.full_name,customer.phone,customer.skin_type,customer.notes,user.id).run(); return json({ customer }, 201);
    }
    if (url.pathname === "/api/users" && request.method === "POST") {
      if (!requires(user, "admin")) return json({ error: "Yönetici yetkisi gerekli." }, 403);
      const data = await body(request); if (!data.full_name || !data.email || !data.password) return json({ error: "Ad, e-posta ve şifre zorunlu." }, 400);
      const digest = await passwordHash(String(data.password));
      try { await env.DB.prepare("INSERT INTO users(id,full_name,email,role,password_hash,password_salt) VALUES(?,?,?,?,?,?)").bind(id(),String(data.full_name).slice(0,120),String(data.email).toLowerCase(),data.role === "admin" ? "admin" : "staff",digest.hash,digest.salt).run(); return json({ ok:true },201); } catch { return json({ error:"Bu e-posta zaten kayıtlı." },409); }
    }
    return json({ error: "Bulunamadı." }, 404);
  }
};
