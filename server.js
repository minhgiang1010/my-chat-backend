const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "YOUR_SECRET_KEY";

// Upload avatar
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MySQL pool
const pool = mysql.createPool({
  host: "xstore.kunder.info", // IP server MySQL
  user: "xstore",
  password: "xstore@kunder.info",
  database: "xstore",
  port: 3306, // Port mặc định của MySQL
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ==================== Register ====================
app.post("/api/register", upload.single("avatar"), async (req, res) => {
  const { full_name, nickname, birth_date, email, hometown, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: "Missing fields" });

  const hashed = await bcrypt.hash(password, 10);
  const avatar_url = req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}` : null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, nickname, birth_date, email, hometown, avatar, password) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) return res.status(400).json({ error: "User not found" });

    const user = rows[0];
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
const io = new Server(http, { cors: { origin: "*", methods: ["GET", "POST"] } });

let onlineUsers = {}; // socketId => userId

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("user-online", (userId) => {
    onlineUsers[userId] = socket.id;
    io.emit("online-users", Object.keys(onlineUsers));
  });

  socket.on("join-room", (roomId) => {
    socket.join(`room-${roomId}`);
  });

  socket.on("send-message", async (data) => {
    const { roomId, senderId, message } = data;
    try {
      await pool.execute(
        "INSERT INTO messages (room_id, sender_id, message) VALUES (?, ?, ?)",
        [roomId, senderId, message]
      );
      io.to(`room-${roomId}`).emit("receive-message", data);
    } catch (err) {
      console.error("Message insert failed:", err);
    }
  });

  socket.on("disconnect", () => {
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) delete onlineUsers[userId];
    }
    io.emit("online-users", Object.keys(onlineUsers));
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`✅ Server running on port ${PORT} and connected to MySQL`);
  } catch (err) {
    console.error("❌ MySQL connection failed:", err);
  }
});
