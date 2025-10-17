import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { pool } from './config/db.js'; // MySQL pool
import userRoutes from './routes/users.js';
import messageRoutes from './routes/messages.js';

dotenv.config();
const app = express();
const server = http.createServer(app);

// Khởi tạo Socket.IO server và cấu hình CORS
export const io = new Server(server, {cors: {origin: '*'}});

app.use(cors());
app.use(express.json());

// Middleware: Gắn đối tượng io vào req để có thể sử dụng trong các controller API
app.use((req, res, next) => {
    req.io = io;
    next();
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// ========================
// LOGIC QUẢN LÝ SOCKET & ONLINE STATUS
// ========================
// Map lưu trữ số lượng kết nối (socket) hiện tại của mỗi User. Key: userId, Value: count
const userConnections = new Map();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // --- user join socket + set online ---
    socket.on('join', async (userId) => {
        socket.userId = userId; // lưu userId trên socket
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined socket room`);

        // Cập nhật số lượng kết nối
        const currentCount = userConnections.get(Number(userId)) || 0;
        userConnections.set(Number(userId), currentCount + 1);

        // Chỉ update DB và emit khi người dùng chuyển từ OFFLINE (0 kết nối) sang ONLINE (1 kết nối)
        if (currentCount === 0) {
            try {
                await pool.query('UPDATE users SET isOnline=1 WHERE id=?', [userId]);
                io.emit('userStatusChange', {id: Number(userId), isOnline: true});
                console.log(`User ${userId} set ONLINE in DB.`);
            } catch (err) {
                console.error('Set user online error:', err);
            }
        }
    });

    // --- join chat room ---
    socket.on('joinRoom', (roomId) => {
        socket.join(`room_${roomId}`);
        console.log(`Socket ${socket.id} joined room_${roomId}`);
    });

    // --- send message ---
    socket.on('send_message', async (msg) => {
        try {
            const [insert] = await pool.query(
                    'INSERT INTO messages (room_id, sender_id, message) VALUES (?, ?, ?)',
                    [msg.room_id, msg.sender_id, msg.message]
                    );

            // Thêm ID và timestamp (hoặc lấy từ DB nếu muốn chính xác hơn)
            msg.id = insert.insertId;
            msg.created_at = new Date();

            // 2️⃣ Lấy danh sách thành viên trong phòng
            const [members] = await pool.query(
                    'SELECT user_id FROM room_members WHERE room_id = ?',
                    [msg.room_id]
                    );

            // Phát tin nhắn đến tất cả socket trong phòng
            io.to(`room_${msg.room_id}`).emit('receive_message', msg);
            
            // 4️⃣ Gửi cập nhật chatlist tới TẤT CẢ thành viên (trừ sender)
            for (const member of members) {
                    io.to(`user_${member.user_id}`).emit('update_chatlist', msg);
                    console.log('update_chatlist: '+ member.user_id);
            }
        } catch (err) {
            console.error('Error sending and saving message:', err);
            // Có thể emit lỗi ngược lại cho client
            socket.emit('message_error', {error: 'Failed to send message.'});
        }
    });

    // --- disconnect / set offline ---
    socket.on('disconnect', async () => {
        console.log('Socket disconnected:', socket.id);
        if (socket.userId) {
            const userId = Number(socket.userId);
            const currentCount = userConnections.get(userId) || 1;
            const newCount = currentCount - 1;

            userConnections.set(userId, newCount);

            // Chỉ update DB và emit khi người dùng về 0 kết nối
            if (newCount <= 0) {
                userConnections.delete(userId); // Xóa khỏi Map
                try {
                    await pool.query('UPDATE users SET isOnline=0 WHERE id=?', [userId]);
                    io.emit('userStatusChange', {id: userId, isOnline: false});
                    console.log(`User ${userId} set OFFLINE in DB.`);
                } catch (err) {
                    console.error('Set user offline error:', err);
                }
            }
        }
    });
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));