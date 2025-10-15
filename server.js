const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "YOUR_SECRET_KEY";

// Upload avatar
const storage = multer.memoryStorage();
const upload = multer({ storage });

// PostgreSQL pool
const pool = new Pool({
  host: "dpg-d3nmch49c44c73edcong-a.oregon-postgres.render.com",
  user: "mychatdb_6dpv_user",
  password: "9IH4M9jNVSSfISSuJSd6BphMk6WElcSr",
  database: "mychatdb_6dpv",
  port: 5432,
  ssl: { rejectUnauthorized: false }, // Bắt buộc với Render
});

// ==================== Register ====================
app.post("/api/register", upload.single("avatar"), async (req, res) => {
  const { full_name, nickname, birth_date, email, hometown, password } = req.body;
  if (!full_name || !email || !password)
    return res.status(400).json({ error: "Missing fields" });

  const hashed = await bcrypt.hash(password, 10);
  const avatar_url = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
    : null;

  try {
    await pool.query(
      `INSERT INTO users (full_name, nickname, birth_date, email, hometown, avatar, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [full_name, nickname, birth_date, email, hometown, avatar_url, hashed]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Email already exists or query failed" });
  }
});

// ==================== Login ====================
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: "7d" });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ==================== Socket.IO ====================
const http = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(http, { cors: { origin: "*", methods: ["GE]()*
