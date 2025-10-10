const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors()); // cho phép kết nối từ frontend

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // hoặc đổi thành URL frontend
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("send-message", (data) => {
    // gửi tin nhắn tới tất cả client khác
    socket.broadcast.emit("receive-message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.send("Chat server is running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
