import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { openDb, run, get, all } from "./db.js";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DB_PATH = process.env.DB_PATH || "./data.sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

const db = openDb(DB_PATH);

function nowIso() { return new Date().toISOString(); }

function signToken(user) {
  return jwt.sign(
    { uid: user.id, email: user.email, nickname: user.nickname, role: user.role, avatar_url: user.avatar_url || "" },
    JWT_SECRET,
    { expiresIn: "14d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "BAD_TOKEN" }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}

function normalizeEmail(v){ return String(v||"").trim().toLowerCase(); }
function cleanText(v, max=200){ const s = String(v||"").trim(); return s.length>max ? s.slice(0,max) : s; }

// API
app.get("/api/health", (req,res)=>res.json({ok:true,time:nowIso()}));

app.post("/api/auth/register", async (req,res)=>{
  try{
    const { email, nickname, password, avatar_url, role, logist_code } = req.body || {};
    const e = normalizeEmail(email);
    const n = cleanText(nickname, 40);
    const p = String(password||"");
    const av = cleanText(avatar_url, 400);
    const r = role === "LOGIST" ? "LOGIST" : "DRIVER";

    if(!e.includes("@")) return res.status(400).json({ error:"EMAIL_INVALID" });
    if(n.length < 2) return res.status(400).json({ error:"NICKNAME_SHORT" });
    if(p.length < 6) return res.status(400).json({ error:"PASSWORD_SHORT" });

    if(r === "LOGIST"){
      const need = String(process.env.LOGIST_INVITE_CODE || "").trim();
      const got = String(logist_code || "").trim();
      if(!need) return res.status(500).json({ error:"LOGIST_CODE_NOT_CONFIGURED" });
      if(!got) return res.status(403).json({ error:"LOGIST_CODE_REQUIRED" });
      if(got !== need) return res.status(403).json({ error:"LOGIST_CODE_INVALID" });
    }

    const exists = await get(db, "SELECT id FROM users WHERE email = ?", [e]);
    if(exists) return res.status(409).json({ error:"EMAIL_TAKEN" });

    const hash = await bcrypt.hash(p, 10);
    const createdAt = nowIso();
    const ins = await run(db,
      "INSERT INTO users (nickname,email,password_hash,avatar_url,role,created_at) VALUES (?,?,?,?,?,?)",
      [n, e, hash, av || null, r, createdAt]
    );

    const user = { id: ins.lastID, email: e, nickname: n, role: r, avatar_url: av || "" };
    const token = signToken(user);
    res.json({ token, user });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

app.post("/api/auth/login", async (req,res)=>{
  try{
    const { login, password } = req.body || {};
    const l = String(login||"").trim();
    const p = String(password||"");
    if(!l) return res.status(400).json({ error:"LOGIN_REQUIRED" });
    if(!p) return res.status(400).json({ error:"PASSWORD_REQUIRED" });

    let user = null;
    if(l.includes("@")) user = await get(db, "SELECT * FROM users WHERE email = ?", [normalizeEmail(l)]);
    else user = await get(db, "SELECT * FROM users WHERE nickname = ?", [l]);

    if(!user) return res.status(401).json({ error:"BAD_CREDENTIALS" });
    const ok = await bcrypt.compare(p, user.password_hash);
    if(!ok) return res.status(401).json({ error:"BAD_CREDENTIALS" });

    const token = signToken(user);
    res.json({ token, user: { id:user.id, email:user.email, nickname:user.nickname, role:user.role, avatar_url:user.avatar_url||"" } });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

app.get("/api/me", auth, (req,res)=>res.json({ user: req.user }));

app.post("/api/reports", auth, requireRole("DRIVER","LOGIST"), async (req,res)=>{
  try{
    const b = req.body || {};
    const type = b.type === "РАЗГРУЗКА" ? "РАЗГРУЗКА" : "ЗАГРУЗКА";
    const from_city = cleanText(b.from_city, 80);
    const to_city = cleanText(b.to_city, 80);
    if(!from_city || !to_city) return res.status(400).json({ error:"ROUTE_REQUIRED" });

    const cargo = cleanText(b.cargo, 120);
    const truck = cleanText(b.truck, 80);
    const trailer = cleanText(b.trailer, 80);
    const km = Number(b.km||0) || 0;
    const date_from = b.date_from ? String(b.date_from) : null;
    const date_to = b.date_to ? String(b.date_to) : null;
    const score = Number(b.score||0) || 0;
    const note = cleanText(b.note, 500);

    const createdAt = nowIso();
    const updatedAt = createdAt;

    const ins = await run(db, `
      INSERT INTO reports
      (user_id,type,from_city,to_city,cargo,truck,trailer,km,date_from,date_to,score,status,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      req.user.uid, type, from_city, to_city, cargo, truck, trailer, km,
      date_from, date_to, score, "PENDING", note, createdAt, updatedAt
    ]);

    const row = await get(db, "SELECT * FROM reports WHERE id = ?", [ins.lastID]);
    res.json({ report: row });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

app.get("/api/reports", auth, requireRole("DRIVER","LOGIST"), async (req,res)=>{
  try{
    const q = String(req.query.q||"").trim().toLowerCase();
    const type = String(req.query.type||"ALL").toUpperCase();
    const status = String(req.query.status||"ALL").toUpperCase();

    let where = [];
    let params = [];

    if(req.user.role === "DRIVER"){
      where.push("r.user_id = ?");
      params.push(req.user.uid);
    }

    if(type === "ЗАГРУЗКА" || type === "РАЗГРУЗКА"){ where.push("r.type = ?"); params.push(type); }
    if(["PENDING","APPROVED","REJECTED"].includes(status)){ where.push("r.status = ?"); params.push(status); }

    if(q){
      where.push(`(LOWER(r.from_city) LIKE ? OR LOWER(r.to_city) LIKE ? OR LOWER(r.cargo) LIKE ?
                 OR LOWER(r.truck) LIKE ? OR LOWER(r.note) LIKE ?
                 OR LOWER(u.nickname) LIKE ? OR LOWER(u.email) LIKE ?)`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await all(db, `
      SELECT r.*, u.nickname AS driver_nick, u.email AS driver_email, u.avatar_url AS driver_avatar
      FROM reports r
      JOIN users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT 500
    `, params);

    res.json({ reports: rows });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

app.patch("/api/reports/:id/status", auth, requireRole("LOGIST"), async (req,res)=>{
  try{
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if(!["PENDING","APPROVED","REJECTED"].includes(status)) return res.status(400).json({ error:"BAD_STATUS" });
    await run(db, "UPDATE reports SET status=?, updated_at=? WHERE id=?", [status, nowIso(), id]);
    res.json({ ok:true });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

app.delete("/api/reports/:id", auth, requireRole("LOGIST"), async (req,res)=>{
  try{
    const id = Number(req.params.id);
    if(!id) return res.status(400).json({ error:"BAD_ID" });
    const del = await run(db, "DELETE FROM reports WHERE id=?", [id]);
    res.json({ ok:true, changes: del.changes });
  }catch{
    res.status(500).json({ error:"SERVER_ERROR" });
  }
});

// Frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req,res)=>res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, ()=>console.log("Server running on port", PORT));
