import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import { getMessages, sendMessage, getRoomMembers } from '../controllers/messageController.js';

const router = express.Router();

router.get('/:room_id', verifyToken, getMessages);
router.get('/rooms/:room_id', verifyToken, getRoomMembers);

router.post('', verifyToken, sendMessage);

export default router;
