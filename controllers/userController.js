import { pool } from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';


const app = express();
const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: '*' } });


// --- REGISTER ---
export const register = async (req, res) => {
    const {full_name, nickname, birth_date, email, hometown, password} = req.body;
    let avatar = null;

    if (!password)
        return res.status(400).json({message: "Password is required"});

    if (req.file) {
        // Convert avatar binary -> base64
        avatar = req.file.buffer.toString('base64');
    }

    try {
        const [exists] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (exists.length)
            return res.status(400).json({message: 'Email already exists'});

        const hash = await bcrypt.hash(password, 10);

        await pool.query(
                'INSERT INTO users (full_name, nickname, birth_date, email, hometown, avatar, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [full_name, nickname, birth_date, email, hometown, avatar, hash]
                );

        res.json({message: 'User registered successfully'});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
};

// --- LOGIN ---
export const login = async (req, res) => {
    const {email, password} = req.body;
    if (!email || !password)
        return res.status(400).json({message: "Email and password required"});

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (!users.length)
            return res.status(400).json({message: 'User not found'});

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match)
            return res.status(400).json({message: 'Wrong password'});

        const token = jwt.sign(
                {id: user.id, email: user.email},
                process.env.JWT_SECRET || 'secretkey',
                {expiresIn: '7d'}
        );

        res.json({token, user: {id: user.id, full_name: user.full_name, email: user.email, avatar: user.avatar}});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: err.message});
    }
};


export const getListUser = async (req, res) => {
  const { id } = req.params;

  try {
    const userId = parseInt(id, 10);

    // Lấy tất cả user khác
    const [users] = await pool.query(
      `SELECT id, full_name, nickname, avatar FROM users WHERE id != ?`,
      [userId]
    );

    // Xử lý song song tất cả user
    const results = await Promise.all(
      users.map(async (u) => {
        // Kiểm tra xem 2 user đã có phòng private chưa
        const [room] = await pool.query(`
          SELECT r.id FROM rooms r
          JOIN room_members rm1 ON r.id = rm1.room_id
          JOIN room_members rm2 ON r.id = rm2.room_id
          WHERE r.type = 'private'
            AND rm1.user_id = ?
            AND rm2.user_id = ?
        `, [userId, u.id]);

        let roomId;
        if (room.length) {
          roomId = room[0].id; // Đã có phòng
        } else {
          // Tạo phòng mới
          const [newRoom] = await pool.query(
            `INSERT INTO rooms (type, name) VALUES ('private', NULL)`
          );
          roomId = newRoom.insertId;

          await pool.query(
            `INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)`,
            [roomId, userId, roomId, u.id]
          );
        }

        const [lastMsg] = await pool.query(
          `SELECT message, sender_id FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 1`,
          [roomId]
        );

        return {
          id: u.id,
          full_name: u.full_name,
          nickname: u.nickname,
          avatar: u.avatar,
          room_id: roomId,
          lastMessage: lastMsg.length ? lastMsg[0].message : null,
          mesSender_id: lastMsg.length ? lastMsg[0].sender_id : null
        };
      })
    );

    res.json({ data: results });
  } catch (err) {
    console.error("❌ getListUser error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};




export const setUserOnline = async (req, res) => {
    const {id} = req.params;
    const {isOnline} = req.body;
    try {
        await pool.query('UPDATE users SET isOnline=? WHERE id=?', [isOnline ? 1 : 0, id]);
        io.emit('userStatusChange', {id: Number(id), isOnline: !!isOnline});
        res.json({success: 'true'});
    } catch (err) {
        console.error('err');
        res.status(500).json({success: isOnline});
    }
};


export const getUser = async (req, res) => {
  const { id } = req.params; 

  try {
    const [rows] = await pool.query('SELECT id, full_name, nickname, avatar FROM users WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: rows[0]
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
