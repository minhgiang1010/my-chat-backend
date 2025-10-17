import express from 'express';
import multer from 'multer';
import { register, login, getListUser, setUserOnline, getUser } from '../controllers/userController.js';

const router = express.Router();
const upload = multer(); // lưu tạm vào memory

// Register (có avatar)
router.post('/register', upload.single("avatar"), register);

// Login (JSON body)
router.post('/login', login);

// Login (JSON body)
router.get('/list/:id', getListUser);

//set status online
router.post('/online/:id', setUserOnline);

//get user detail
router.get('/detail/:id', getUser);

export default router;
