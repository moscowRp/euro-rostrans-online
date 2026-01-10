import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { openDb, run, get, all } from "./db.js";

dotenv.config();

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DB_PATH = process.env.DB_PATH || "./data.sqlite";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5500";

const app = express();
app.use(express.json());
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));

const db = openDb(DB_PATH);

function nowIso() {
  return new Date().toISOString();
}

function signToken(user) {
  return jwt.sign(
    { uid: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "BAD_TOKEN" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    next();
  };
}

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, time: nowIso() }));

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, role, logist_code } = req.body || {};
    const u = String(username || "").trim();
    const p = String(password || "");
    const r = role === "LOGIST" ? "LOGIST" : role === "DRIVER" ? "DRIVER" : null;

    // ✅ LOGIST — только по коду приглашения
    if (r === "LOGIST") {
      const need = String(process.env.LOGIST_INVITE_CODE || "").trim();
      const got = String(logist_code || "").trim();

      if (!need) return res.status(500).json({ error: "LOGIST_CODE_NOT_CONFIGURED" });
      if (!got) return res.status(403).json({ error: "LOGIST_CODE_REQUIRED" });
      if (got !== need) return res.status(403).json({ error: "LOGIST_CODE_INVALID" });
    }


    if (u.length < 3) return res.status(400).json({ error: "USERNAME_SHORT" });
    if (p.length < 6) return res.status(400).json({ error: "PASSWORD_SHORT" });
    if (!r) return res.status(400).json({ error: "ROLE_REQUIRED" });

    const exists = await get(db, "SELECT id FROM users WHERE username = ?", [u]);
    if (exists) return res.status(409).json({ error: "USERNAME_TAKEN" });

    const hash = await bcrypt.hash(p, 10);
    const createdAt = nowIso();
    const ins = await run(
      db,
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?,?,?,?)",
      [u, hash, r, createdAt]
    );

    const user = { id: ins.lastID, username: u, role: r };
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = String(username || "").trim();
    const p = String(password || "");

    const user = await get(db, "SELECT * FROM users WHERE username = ?", [u]);
    if (!user) return res.status(401).json({ error: "BAD_CREDENTIALS" });

    const ok = await bcrypt.compare(p, user.password_hash);
    if (!ok) return res.status(401).json({ error: "BAD_CREDENTIALS" });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Me
app.get("/api/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

// Create report
app.post("/api/reports", auth, requireRole("DRIVER", "LOGIST"), async (req, res) => {
  try {
    const b = req.body || {};
    const type = b.type === "РАЗГРУЗКА" ? "РАЗГРУЗКА" : "ЗАГРУЗКА";
    const from_city = String(b.from_city || "").trim();
    const to_city = String(b.to_city || "").trim();
    if (!from_city || !to_city) return res.status(400).json({ error: "ROUTE_REQUIRED" });

    const cargo = String(b.cargo || "").trim();
    const truck = String(b.truck || "").trim();
    const trailer = String(b.trailer || "").trim();
    const km = Number(b.km || 0) || 0;
    const date_from = b.date_from ? String(b.date_from) : null;
    const date_to = b.date_to ? String(b.date_to) : null;
    const score = Number(b.score || 0) || 0;
    const note = String(b.note || "").trim();

    const createdAt = nowIso();
    const updatedAt = createdAt;

    const ins = await run(db, `
      INSERT INTO reports
      (user_id,type,from_city,to_city,cargo,truck,trailer,km,date_from,date_to,score,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      req.user.uid, type, from_city, to_city, cargo, truck, trailer, km,
      date_from, date_to, score, note, createdAt, updatedAt
    ]);

    const row = await get(db, "SELECT * FROM reports WHERE id = ?", [ins.lastID]);
    res.json({ report: row });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// List reports
app.get("/api/reports", auth, requireRole("DRIVER", "LOGIST"), async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const type = String(req.query.type || "ALL").toUpperCase();

    let where = [];
    let params = [];

    if (req.user.role === "DRIVER") {
      where.push("r.user_id = ?");
      params.push(req.user.uid);
    }

    if (type === "ЗАГРУЗКА" || type === "РАЗГРУЗКА") {
      where.push("r.type = ?");
      params.push(type);
    }

    if (q) {
      where.push(`
        (LOWER(r.from_city) LIKE ? OR LOWER(r.to_city) LIKE ? OR LOWER(r.cargo) LIKE ? OR LOWER(r.truck) LIKE ? OR LOWER(r.note) LIKE ? OR LOWER(u.username) LIKE ?)
      `);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await all(db, `
      SELECT r.*, u.username AS driver_name
      FROM reports r
      JOIN users u ON u.id = r.user_id
      ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT 500
    `, params);

    res.json({ reports: rows });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Delete report (LOGIST only)
app.delete("/api/reports/:id", auth, requireRole("LOGIST"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "BAD_ID" });

    const del = await run(db, "DELETE FROM reports WHERE id = ?", [id]);
    res.json({ ok: true, changes: del.changes });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});


// Update report status (LOGIST only)
app.patch("/api/reports/:id/status", auth, requireRole("LOGIST"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ["PENDING","APPROVED","REJECTED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "BAD_STATUS" });
    }
    await run(db, "UPDATE reports SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});
