const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require("socket.io");

const { generateMessage, generateLocationMessage, generateFiles } = require('./utils/message');
const { isRealString } = require('./utils/validation');
const { Users } = require('./utils/users');
const { upload } = require("./middlewares/file-upload");

const app = express();
const publicPath = path.join(__dirname, '../../public');
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Update with your frontend URL if needed
    methods: ["GET", "POST"]
  }
});

const users = new Users();

// Serve static files from the public folder.
app.use(express.static(publicPath));
app.use('/uploads', express.static(path.join(__dirname, '../../public/uploads')));

// File upload endpoint using the middleware.
app.post('/upload', upload.single('file'), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    message: 'File uploaded successfully',
    file: req.file,
    fileUrl: `https://opulententrepreneurs.business/api/uploads/${req.file.filename}`
  });
});

// Socket.IO connection and event handling.
io.on('connection', (socket) => {

  // Client uses this event to join a specific chat lobby.
  socket.on('joinChatLobby', (params, callback) => {
    // Expecting params: { name, chatLobbyId }
    if (!isRealString(params.name) || !isRealString(params.chatLobbyId)) {
      return callback('Name and chat lobby ID are required.');
    }
    socket.join(params.chatLobbyId);
    users.removeUser(socket.id);
    // Use chatLobbyId as the room identifier.
    users.addUser(socket.id, params.name, params.chatLobbyId);

    io.to(params.chatLobbyId).emit('updateUserList', users.getUserList(params.chatLobbyId));
    socket.emit('newMessage', generateMessage('Admin', 'Welcome to the chat lobby'));
    socket.broadcast.to(params.chatLobbyId).emit('newMessage', generateMessage('Admin', `${params.name} has joined the chat lobby.`));
    callback();
  });

  // When a client sends a message to the chat lobby.
  socket.on('createMessage', (message, callback) => {
    const user = users.getUser(socket.id);
    if (user && isRealString(message.text) && isRealString(user.room)) {
      io.to(user.room).emit('newMessage', generateMessage(user.name, message.text));
    }
    callback();
  });

  // Private messaging events.
  socket.on('createPrivateMessage', (message) => {
    socket.broadcast.to(message.userid).emit('newPrivateMessage', {
      message: message.message,
      user: users.getUser(socket.id)
    });
  });

  socket.on('privateMessageWindow', (userid) => {
    socket.broadcast.to(userid.id).emit('notifyUser', {
      user: users.getUser(socket.id),
      otherUser: userid.id
    });
  });

  socket.on('private_connection_successful', (user) => {
    socket.broadcast.to(user.user.id).emit('openChatWindow', {
      user: users.getUser(user.otherUserId)
    });
  });

  socket.on('privateMessageSendSuccessful', (message) => {
    const message_object = {
      message: message.message,
      user: users.getUser(message.userid),
      id: socket.id
    };
    socket.broadcast.to(message.userid).emit('privateMessageSuccessfulAdd', message_object);
  });

  // Location message event.
  socket.on('createLocationMessage', (coords) => {
    const user = users.getUser(socket.id);
    if (user) {
      io.to(user.room).emit('newLocationMessage', generateLocationMessage(user.name, coords.latitude, coords.longitude));
    }
  });

  // File message event for group chat.
  socket.on('newFileMessage', (fileInfo) => {
    const user = users.getUser(socket.id);
    if (user && isRealString(fileInfo.filename)) {
      // generateFiles returns an object with details like from, url, createdAt, and isImage.
      io.to(user.room).emit('newFileMessage', generateFiles(user.name, fileInfo.filename));
    }
  });

  // Private file message event.
  socket.on('newPrivateFileMessage', (info) => {
    const user = users.getUser(socket.id);
    socket.broadcast.to(info.userid).emit('newPrivateFileMessage', {
      user: user,
      fileInfo: info.fileInfo
    });
  });

  socket.on('privateFileSendSuccessful', (info) => {
    const user = users.getUser(info.user.id);
    socket.broadcast.to(info.user.id).emit('privateFileSendSuccessful', {
      filename: info.fileInfo.filename,
      user: user,
      id: socket.id
    });
  });

  // Audio call events.
  socket.on('initializeAudioCall', (userid) => {
    const user = users.getUser(socket.id);
    socket.broadcast.to(userid).emit('incomingCall', user);
  });

  socket.on('callReceived', (userid) => {
    socket.broadcast.to(userid).emit('notifyCallReceived');
  });

  socket.on('audioCall', (stream) => {
    socket.broadcast.to(stream.userid).emit('onAudioCall', stream.blob);
  });

  socket.on('callEnded', (userid) => {
    const user = users.getUser(socket.id);
    socket.broadcast.to(userid).emit('callEnded', user);
  });

  socket.on('userBusy', (userid) => {
    socket.broadcast.to(userid).emit('userBusy');
  });

  socket.on('callNotReceived', (userid) => {
    socket.broadcast.to(userid).emit('callNotReceived');
  });

  // Handle disconnection.
  socket.on('disconnect', () => {
    const user = users.removeUser(socket.id);
    if (user) {
      io.to(user.room).emit('updateUserList', users.getUserList(user.room));
      io.to(user.room).emit('newMessage', generateMessage('Admin', `${user.name} has left.`));
    }
  });
});

// Start the HTTP server.
httpServer.listen(4000, () => {
});
