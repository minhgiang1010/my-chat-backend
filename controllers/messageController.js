import { pool } from '../config/db.js';

// Lấy thành viên theo room
export const getRoomMembers = async (req, res) => {
    try {
        const {room_id} = req.params;

        const [rows] = await pool.query(`
            SELECT r.id, r.name,
              JSON_ARRAYAGG(JSON_OBJECT(
                'id', u.id,
                'full_name', u.full_name,
                'nickname', u.nickname,
                'avatar', u.avatar,
                'email', u.email
              )) AS members
            FROM rooms r
            JOIN room_members rm ON r.id = rm.room_id
            JOIN users u ON rm.user_id = u.id
            WHERE r.id = ?
            GROUP BY r.id
        `, [room_id]);

        // Nếu không tìm thấy room, trả về null hoặc object rỗng
        if (rows.length === 0) {
            return res.status(404).json({message: 'Room not found'});
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error getting room members:', err.message);
        res.status(500).json({error: err.message});
    }
};

// Lấy tin nhắn theo room
export const getMessages = async (req, res) => {
    try {
        const {room_id} = req.params;
        const [rows] = await pool.query(`
          SELECT m.*, u.full_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          WHERE m.room_id = ?
          ORDER BY m.created_at ASC
        `, [room_id]);
        res.json(rows);
    } catch (err) {
        console.error('Error getting messages:', err.message);
        res.status(500).json({error: err.message});
    }
};

// Gửi tin nhắn qua API REST và broadcast qua Socket.IO
export const sendMessage = async (req, res) => {
    try {
        const {roomId, senderId, message} = req.body;

        // 1. Lưu tin nhắn vào DB
        const [insert] = await pool.query(
                'INSERT INTO messages (room_id, sender_id, message) VALUES (?, ?, ?)',
                [roomId, senderId, message]
                );

        // 2. Lấy tin nhắn đầy đủ với thông tin người gửi
        const [rows] = await pool.query(
                `SELECT m.*, u.full_name AS sender_name, u.avatar AS sender_avatar
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.id = ?`,
                [insert.insertId]
                );
        const msg = rows[0];
        // 2️⃣ Lấy danh sách thành viên trong phòng
        const [members] = await pool.query(
                'SELECT user_id FROM room_members WHERE room_id = ?',
                [roomId]
                );
        // 3. ⚡ broadcast ngay tại API bằng cách sử dụng req.io
        if (req.io) {
            req.io.to(`room_${roomId}`).emit('receive_message', msg);
            for (const member of members) {
                    req.io.to(`user_${member.user_id}`).emit('update_chatlist', msg);
                    console.log('update_chatlist: '+ member.user_id);
            }
        } else {
            console.warn('Socket.IO instance not attached to request. Cannot broadcast message.');
        }

        // 4. Trả về cho client đã gọi API
        res.status(201).json(msg);
    } catch (err) {
        console.error('Error sending message via API:', err.message);
        res.status(500).json({error: err.message});
    }
};