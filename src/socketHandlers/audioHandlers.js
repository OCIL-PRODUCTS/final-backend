// src/socketHandlers/audioCallHandlers.js
// Note: We import the shared users instance.
const { users } = require('./usersInstance');

module.exports.registerAudioCallHandlers = (socket, io) => {
  // Caller initiates an audio call using the chat lobby id.
  socket.on('initializeAudioCall', (chatLobbyId) => {
    const user = users.getUser(socket.id);
    // Broadcast to the room except the caller.
    socket.to(chatLobbyId).emit('incomingCall', user);
  });

  socket.on('initializeVideoCall', (chatLobbyId) => {
    const user = users.getUser(socket.id);
    socket.to(chatLobbyId).emit('incomingVideoCall', user);
  });

  socket.on('callReceived', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('notifyCallReceived');
  });

  socket.on('videoCallReceived', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('notifyVideoCallReceived');
  });

  socket.on('audioCall', (data) => {
    // data should be an object: { chatLobbyId, blob }
    socket.to(data.chatLobbyId).emit('onAudioCall', data.blob);
  });

  socket.on('videoCall', (data) => {
    socket.to(data.chatLobbyId).emit('onVideoCall', data.blob);
  });

  socket.on('callEnded', (chatLobbyId) => {
    const user = users.getUser(socket.id);
    socket.to(chatLobbyId).emit('callEnded', user);
  });

  socket.on('videoCallEnded', (chatLobbyId) => {
    const user = users.getUser(socket.id);
    socket.to(chatLobbyId).emit('videoCallEnded', user);
  });

  socket.on('userBusy', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('userBusy');
  });

  socket.on('userVideoBusy', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('userVideoBusy');
  });

  socket.on('callNotReceived', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('callNotReceived');
  });

  socket.on('videoCallNotReceived', (chatLobbyId) => {
    socket.to(chatLobbyId).emit('videoCallNotReceived');
  });
};
