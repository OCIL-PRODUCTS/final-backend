// src/socketHandlers/privateHandlers.jsx
import { users } from './usersInstance';

export const registerPrivateHandlers = (socket, io) => {
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
    const messageObject = {
      message: message.message,
      user: users.getUser(message.userid),
      id: socket.id
    };
    socket.broadcast.to(message.userid).emit('privateMessageSuccessfulAdd', messageObject);
  });
};
