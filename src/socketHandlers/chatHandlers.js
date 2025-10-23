// src/socketHandlers/chatHandlers.jsx
import mongoose from 'mongoose';
import moment from 'moment';
import { isRealString } from '../utils/validation';
import Message from '../models/Message';
import TribeMessage from '../models/TribeMessage';
import Notification from '../models/notifications';
import User from '../models/user';
import ChatLobby from '../models/chatlobby';
import TribeChatLobby from '../models/tribechatlobby';
import { users } from './usersInstance';
import { Storage } from '@google-cloud/storage';
import redis from '../clients/redis.js';

const BUFFER_BATCH_SIZE = 10;

const gcs = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
});
const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME);

export const deleteFromFirebase = async (publicUrl) => {
  try {
    const parts = publicUrl.split(`${bucket.name}/`);
    if (parts.length !== 2) {
      throw new Error(`Unexpected URL format: ${publicUrl}`);
    }
    const filePath = decodeURIComponent(parts[1]);
    await bucket.file(filePath).delete();
  } catch (err) {
    console.error("GCS deletion error:", err);
    throw new Error(`Failed to delete ${publicUrl}: ${err.message}`);
  }
};

/**
 * Flush buffered chat messages for a room into MongoDB in bulk.
 */
async function flushChatBuffer(room) {
  const key = `chat:buffer:${room}`;
  const items = await redis.lrange(key, 0, -1);
  if (!items.length) return;

  const docs = items.map((raw) => {
    const p = JSON.parse(raw);
    return {
      chatLobbyId: room,
      sender: new mongoose.Types.ObjectId(p.senderId),
      message: p.text,
      type: 'text',
      seen: false,
      sentAt: new Date(p.timestamp),
    };
  });

  try {
    await Message.insertMany(docs);
    // clear deletefor once per batch
    await ChatLobby.findOneAndUpdate(
      { chatLobbyId: room },
      { $set: { deletefor: [] } }
    );
  } catch (err) {
    console.error('Error bulk‐inserting chat buffer for room', room, err);
    // leave the buffer intact for retry
    return;
  }

  await redis.del(key);
}

/**
 * Flush buffered tribe messages for a room into MongoDB in bulk.
 */
async function flushTribeBuffer(room) {
  const key = `tribe:buffer:${room}`;
  const items = await redis.lrange(key, 0, -1);
  if (!items.length) return;

  const docs = items.map((raw) => {
    const p = JSON.parse(raw);
    return {
      chatLobbyId: room,
      sender: new mongoose.Types.ObjectId(p.senderId),
      message: p.text,
      type: 'text',
      seen: false,
      sentAt: new Date(p.timestamp),
    };
  });

  try {
    await TribeMessage.insertMany(docs);
    await TribeChatLobby.findOneAndUpdate(
      { chatLobbyId: room },
      { $set: { deletefor: [] } }
    );
  } catch (err) {
    console.error('Error bulk‐inserting tribe buffer for room', room, err);
    return;
  }

  await redis.del(key);
}

export const registerChatHandlers = (socket, io) => {
  // — join a room —
  socket.on('join', (params, callback) => {
    if (
      !isRealString(params.name) ||
      !isRealString(params.room) ||
      !isRealString(params.userId)
    ) {
      return callback('Name, room, and userId are required.');
    }
    socket.join(params.room);
    users.removeUser(socket.id);
    users.addUser(socket.id, params.name, params.room, params.userId);
    io.to(params.room).emit('updateUserList', users.getUserList(params.room));
    callback();
  });
  socket.on('createMessage', async (message, callback) => {
    const user = users.getUser(socket.id);
    if (!(user && isRealString(message.text))) {
      console.error('Invalid user or empty message');
      return callback();
    }

    // Validate and convert reply fields if provided
    let replyIdObj = null;
    let replyUserIdObj = null;
    if (message.reply_id && mongoose.Types.ObjectId.isValid(message.reply_id)) {
      replyIdObj = new mongoose.Types.ObjectId(message.reply_id);
    }
    if (message.reply_userid && mongoose.Types.ObjectId.isValid(message.reply_userid)) {
      replyUserIdObj = new mongoose.Types.ObjectId(message.reply_userid);
    }

    const timestamp = Date.now();
    const msgId = new mongoose.Types.ObjectId();

    // Create the message document and save it to MongoDB
    const newMsg = new Message({
      chatLobbyId: user.room,
      sender: user.userId,
      message: message.text,
      sentAt: new Date(timestamp),
      type: 'text',
      reply_id: replyIdObj,
      reply_userid: replyUserIdObj,
      reply: message.reply || "",
      reply_username: message.reply_username || "",
      reply_media: message.reply_media,
    });

    try {
      // Save the message to MongoDB
      await newMsg.save();

      // Broadcast the new message to the room after it's saved in MongoDB
      io.to(user.room).emit('newMessage', {
        _id: newMsg._id.toString(),  // Use the MongoDB _id for the new message
        text: message.text,
        from: user.name,
        sentAt: new Date(timestamp),
        seen: false,
        type: 'text',
        senderId: user.userId,
        chatLobbyId: user.room,
        reply_id: message.reply_id ? message.reply_id.toString() : null,
        reply_userid: message.reply_userid ? message.reply_userid.toString() : null,
        reply: message.reply || "",
        reply_username: message.reply_username || "",
        reply_media: message.reply_media,
      });

      // Update the chat lobby with the new message
      const updatedLobby = await ChatLobby.findOneAndUpdate(
        { chatLobbyId: user.room },
        {
          $push: { messages: newMsg._id },
          $set: {
            deletefor: [],
            lastmsg: newMsg.message,
            lastmsgid: msgId,
            lastUpdated: new Date(timestamp),
          }
        },
        { new: true }
      );

      // Broadcast the updated lobby to all connected clients
      io.emit('lobbyUpdated', {
        chatLobbyId: updatedLobby.chatLobbyId,
        lastmsg: updatedLobby.lastmsg,
        lastmsgid: updatedLobby.lastmsgid,
        lastUpdated: updatedLobby.lastUpdated,
      });

    } catch (err) {
      console.error("Error saving message to MongoDB:", err);
      callback('Error saving message');
    }

    // Send notifications
    ChatLobby.findOne({ chatLobbyId: user.room })
      .then((lobby) => {
        if (!lobby?.participants) return;
        lobby.participants.forEach(async (participant) => {
          if (participant.toString() === user.userId) return;
          const other = await User.findById(participant);
          if (!other) return;
          await Notification.updateOne(
            { user: participant },
            {
              $addToSet: {
                type: 'message',
                data: `New message from ${user.name}`,
              }
            },
            { upsert: true }
          );
        });
      })
      .catch(console.error);

    callback();
  });


  socket.on('editMessage', async (data, callback) => {
    try {
      const { messageId, newText, userId, chatLobbyId } = data;

      // Ensure that the message ID and new text are valid
      if (!mongoose.Types.ObjectId.isValid(messageId) || !isRealString(newText)) {
        return callback('Invalid message or new text');
      }

      // Check if the message exists in MongoDB
      const mongoMsg = await Message.findById(messageId);
      if (!mongoMsg) return callback('Message not found in MongoDB');

      // Check if the message is older than 7 minutes
      const messageAge = Date.now() - mongoMsg.sentAt.getTime();
      if (messageAge > 7 * 60 * 1000) {
        return callback('Message edit time has expired (7 minutes limit)');
      }

      // Check if the user is the sender of the message
      if (mongoMsg.sender.toString() !== userId) {
        return callback('You can only edit your own messages');
      }

      // Update the message in MongoDB with the new text and set isEdit to true
      await Message.updateOne(
        { _id: messageId },
        {
          $set: {
            message: newText,
            edit: true  // Set isEdit to true when editing
          }
        }
      );

      // Update the chat lobby's last message to "*Message Edited*"
      await ChatLobby.findOneAndUpdate(
        { chatLobbyId: chatLobbyId },
        {
          $set: {
            lastmsg: '*Message Edited*',  // Mark last message as edited
            lastmsgid: messageId,         // Set the last message ID to the edited message
            lastUpdated: new Date()        // Update the timestamp of the last update
          }
        }
      );

      // Broadcast the updated message to everyone in the room
      io.to(chatLobbyId).emit('messageUpdated', {
        _id: mongoMsg._id.toString(),
        chatLobbyId: chatLobbyId,
        text: newText,
        senderId: mongoMsg.sender.toString(),
        sentAt: mongoMsg.sentAt,
        seen: mongoMsg.seen,
        type: mongoMsg.type,
        edit: true, // Mark the message as edited
      });

      callback(null, 'Message updated in MongoDB');
    } catch (err) {
      console.error('Error editing message:', err);
      callback('Error editing message');
    }
  });


  // ----------------- tribeCreateMessage (text) -----------------
  socket.on('tribeCreateMessage', async (data, callback) => {
    try {
      const user = users.getUser(socket.id);
      if (!user || !isRealString(data.text)) {
        return callback('Invalid message');
      }

      // Validate/convert reply ids only if provided and valid
      let replyIdObj = null;
      let replyUserIdObj = null;
      if (data.reply_id && mongoose.Types.ObjectId.isValid(data.reply_id)) {
        replyIdObj = new mongoose.Types.ObjectId(data.reply_id);
      }
      if (data.reply_userid && mongoose.Types.ObjectId.isValid(data.reply_userid)) {
        replyUserIdObj = new mongoose.Types.ObjectId(data.reply_userid);
      }

      // 1) Save to MongoDB (include reply fields)
      const newMsg = await TribeMessage.create({
        chatLobbyId: user.room,
        sender: user.userId,
        message: data.text,
        type: 'text',
        seen: false,
        senderUsername: user.name,
        sentAt: new Date(),
        // reply fields
        reply_id: replyIdObj,             // ObjectId or null
        reply_userid: replyUserIdObj,     // ObjectId or null
        reply: data.reply,        // string
        reply_username: data.reply_username,
        reply_media: data.reply_media,
      });

      // 2) Broadcast to everyone with real IDs (reply fields as strings/null)
      io.to(user.room).emit('newTribeMessage', {
        _id: newMsg._id.toString(),
        text: newMsg.message,
        from: user.name,
        senderUsername: newMsg.senderUsername,
        senderId: user.userId,
        sentAt: newMsg.sentAt,
        seen: newMsg.seen,
        type: newMsg.type,
        // reply payload
        reply_id: newMsg.reply_id ? newMsg.reply_id.toString() : null,
        reply_userid: newMsg.reply_userid ? newMsg.reply_userid.toString() : null,
        reply: newMsg.reply || "",
        reply_username: (newMsg.reply_username || ""),
        reply_media: newMsg.reply_media,
      });

      // 3) (Optional) clear any "deletefor" flags
      await TribeChatLobby.findOneAndUpdate(
        { chatLobbyId: user.room },
        { $set: { deletefor: [] } }
      );

      // 4) Notify other participants
      const lobby = await TribeChatLobby.findOne({ chatLobbyId: user.room });
      if (lobby?.participants) {
        for (const p of lobby.participants) {
          if (p.toString() === user.userId) continue;
          await Notification.updateOne(
            { user: p },
            { $addToSet: { type: 'message', data: `New tribe message from ${user.name}` } },
            { upsert: true }
          );
        }
      }

      callback(null, newMsg);
    } catch (err) {
      console.error('tribeCreateMessage error:', err);
      callback('Server error');
    }
  });
  // Handle TribeEditMessage for tribe chat with a 7-minute limit
  socket.on('tribeEditMessage', async (data, callback) => {
    try {
      const { messageId, newText, userId, chatLobbyId } = data;

      // Ensure that the message ID and new text are valid
      if (!mongoose.Types.ObjectId.isValid(messageId) || !isRealString(newText)) {
        return callback('Invalid message or new text');
      }

      // Check if the tribe message exists in Redis first
      const tempKey = `tribe:buffer:${chatLobbyId}`;
      const bufferItems = await redis.lrange(tempKey, 0, -1);
      let foundInRedis = false;
      let msg = null;

      for (const item of bufferItems) {
        const redisMsg = JSON.parse(item);

        if (redisMsg._id === messageId && redisMsg.senderId === userId) {
          foundInRedis = true;
          msg = redisMsg;
          break;
        }
      }

      if (foundInRedis) {
        // Check if the message is older than 7 minutes
        const messageAge = Date.now() - msg.timestamp;
        if (messageAge > 7 * 60 * 1000) {
          return callback('Message edit time has expired (7 minutes limit)');
        }

        // Update the message in Redis buffer
        msg.text = newText;
        await redis.lrem(tempKey, 1, JSON.stringify(msg));
        await redis.rpush(tempKey, JSON.stringify(msg));

        // Broadcast the updated message to the tribe chat
        io.to(chatLobbyId).emit('tribeMessageUpdated', {
          _id: msg._id.toString(),
          chatLobbyId: chatLobbyId,
          text: newText,
          senderId: msg.senderId,
          sentAt: new Date(msg.timestamp),
          seen: msg.seen,
          type: msg.type,
          edit: true,
        });

        return callback(null, 'Tribe message updated in Redis');
      }

      // If not found in Redis, check MongoDB
      const mongoMsg = await TribeMessage.findById(messageId);
      if (!mongoMsg) return callback('Message not found in MongoDB');

      // Check if the message is older than 7 minutes
      const messageAge = Date.now() - mongoMsg.sentAt.getTime();
      if (messageAge > 7 * 60 * 1000) {
        return callback('Message edit time has expired (7 minutes limit)');
      }

      // Check if the user is the sender of the message
      if (mongoMsg.sender.toString() !== userId) {
        return callback('You can only edit your own messages');
      }

      // Update the message with the new text in MongoDB
      mongoMsg.message = newText;
      mongoMsg.edit = true;
      await mongoMsg.save();

      // Broadcast the updated message to the tribe chat
      io.to(chatLobbyId).emit('tribeMessageUpdated', {
        _id: mongoMsg._id.toString(),
        chatLobbyId: chatLobbyId,
        text: newText,
        senderId: mongoMsg.sender.toString(),
        sentAt: mongoMsg.sentAt,
        seen: mongoMsg.seen,
        type: mongoMsg.type,
        edit: true,
      });

      callback(null, 'Tribe message updated in MongoDB');
    } catch (err) {
      console.error('Error editing tribe message:', err);
      callback('Error editing tribe message');
    }
  });

  socket.on('forwardMessage', async (message, callback) => {
    const { userId1, userId2, messageContent, name } = message;

    if (!userId1 || !userId2 || !messageContent) {
      console.error('Invalid input for forwarding message');
      return callback();
    }

    const timestamp = Date.now();
    const msgId = new mongoose.Types.ObjectId();
    // Find existing lobby
    let existingLobby = await ChatLobby.findOne({
      participants: { $all: [userId1, userId2] }
    });

    const chatLobbyId = existingLobby ? existingLobby.chatLobbyId : uuidv4();
    try {


      // Create the forwarded message document (as a new message)
      const newMessage = new Message({
        chatLobbyId,
        sender: userId1,  // Assuming the sender is userId1
        message: messageContent,
        forward: true,  // Mark it as a forwarded message
        type: 'text',
        sentAt: new Date(timestamp),
      });

      // Save the new forwarded message to MongoDB
      await newMessage.save();

      // Broadcast the forwarded message to the room (to all participants in the lobby)
      io.to(chatLobbyId).emit('newMessage', {
        _id: newMessage._id.toString(),
        text: messageContent,
        from: name,
        sentAt: new Date(timestamp),
        seen: false,
        type: 'text',
        senderId: userId1,
        chatLobbyId: chatLobbyId,
        reply_id: message.reply_id ? message.reply_id.toString() : null,
        reply_userid: message.reply_userid ? message.reply_userid.toString() : null,
        reply: message.reply || "",
        reply_username: message.reply_username || "",
        reply_media: message.reply_media,
      });

      // Update the chat lobby with the new forwarded message
      if (existingLobby) {
        // Update existing lobby's last message and last message ID
        existingLobby.lastmsg = messageContent; // Set the last message content to the forwarded message
        existingLobby.lastmsgid = newMessage._id; // Set the last message ID to the forwarded message's ID
        existingLobby.messages.push(newMessage);  // Push the new message into the existing lobby

        existingLobby.lastUpdated = Date.now();
        await existingLobby.save();

        // Send back the existing chat lobby ID and message
        io.emit('lobbyUpdated', {
          chatLobbyId: existingLobby.chatLobbyId,
          lastmsg: existingLobby.lastmsg,
          lastmsgid: existingLobby.lastmsgid,
          lastUpdated: existingLobby.lastUpdated,
        });

        return callback({
          chatLobbyId: existingLobby.chatLobbyId,
          message: 'Message forwarded to existing lobby and updated as the last message.',
        });
      }

      // If no existing lobby, create a new one
      const newChatLobby = new ChatLobby({
        chatLobbyId,
        participants: [userId1, userId2],
        messages: [newMessage],  // Add the new message to the messages array
        lastmsg: messageContent, // Set the last message content to the forwarded message
        lastmsgid: newMessage._id,
        deletefor: []
      });

      await newChatLobby.save();

      // Send back the new chat lobby ID and message
      io.emit('lobbyUpdated', {
        chatLobbyId: newChatLobby.chatLobbyId,
        lastmsg: newChatLobby.lastmsg,
        lastmsgid: newChatLobby.lastmsgid,
        lastUpdated: newChatLobby.lastUpdated,
      });

      return callback({
        chatLobbyId,
        message: 'Message sent in a new lobby and set as the last message.',
      });

    } catch (err) {
      console.error("Error forwarding message:", err);
      callback('Error forwarding message');
    }

    // Send notifications
    ChatLobby.findOne({ chatLobbyId })
      .then((lobby) => {
        if (!lobby?.participants) return;
        lobby.participants.forEach(async (participant) => {
          if (participant.toString() === userId1) return; // Don't notify the sender
          const other = await User.findById(participant);
          if (!other) return;
          await Notification.updateOne(
            { user: participant },
            {
              $addToSet: {
                type: 'message',
                data: `New forwarded message from ${userId1}`,
              }
            },
            { upsert: true }
          );
        });
      })
      .catch(console.error);
  });


  // — on disconnect: flush any remaining buffers —
  socket.on('disconnect', async () => {
    const user = users.getUser(socket.id);
    if (user) {
      await flushChatBuffer(user.room);
      await flushTribeBuffer(user.room);
      users.removeUser(socket.id);
      io.to(user.room).emit('updateUserList', users.getUserList(user.room));
    }
  });

  // — rest of your handlers unchanged —
  socket.on("messageSeen", async ({ messageId, room, readerId }) => {
    try {
      let updatedMessage;

      if (messageId) {
        // normal path: client told us the exact message _id
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          { seen: true },
          { new: true }
        );
      } else {
        // fallback: mark the most‐recent unseen message in that lobby
        updatedMessage = await Message.findOneAndUpdate(
          { chatLobbyId: room, seen: false },
          { seen: true },
          { sort: { sentAt: -1 }, new: true }
        );
      }

      if (!updatedMessage) return;

      // broadcast back to everyone in the room (including the sender)
      io.to(room).emit("messageUpdated", {
        _id: updatedMessage._id,
        chatLobbyId: room,
        seen: true,
      });
    } catch (err) {
      console.error("Error marking message seen:", err);
    }
  });



  // New deleteMessage event handler
  socket.on('deleteMessage', async (data, callback) => {
    try {
      const userId = data.userId;
      const messageId = data.messageId;
      const chatLobbyId = data.chatLobbyId;
      console.log("Received messageId:", messageId);

      // Check if messageId is valid
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        console.log("Invalid messageId format:", messageId);
        return callback("Invalid message ID format");
      }

      // Check Redis buffer first (for file messages too)
      const tempKey = `chat:buffer:${chatLobbyId}`;
      const bufferItems = await redis.lrange(tempKey, 0, -1);
      let foundInRedis = false;
      let msg = null;

      for (const item of bufferItems) {
        const redisMsg = JSON.parse(item);

        // Match by Redis message _id and senderId
        if (redisMsg._id === messageId && redisMsg.senderId === userId) {
          // Remove from Redis buffer
          await redis.lrem(tempKey, 1, item);

          // Set foundInRedis flag and assign to msg
          foundInRedis = true;
          msg = redisMsg;

          // Update the ChatLobby’s last message to “deleted”
          const deletedText = '<i>*Message Deleted*</i>';
          const now = new Date();
          const updatedLobby = await ChatLobby.findOneAndUpdate(
            { chatLobbyId: chatLobbyId },
            {
              $set: {
                lastmsg: deletedText,
                lastmsgid: null,
                lastUpdated: now
              }
            },
            { new: true }
          );

          // Broadcast both lobby update and message deletion
          io.emit('lobbyUpdated', {
            chatLobbyId: updatedLobby.chatLobbyId,
            lastmsg: updatedLobby.lastmsg,
            lastUpdated: updatedLobby.lastUpdated,
          });
          io.to(chatLobbyId).emit('messageDeleted', {
            messageId: msg._id,
            timestamp: msg.sentAt // Or use msg.timestamp if available
          });

          // If file message, delete the file from GCS
          if (msg.type === "file" && msg.fileUrl) {
            try {
              // Assuming deleteFromFirebase deletes a file from Google Cloud Storage (GCS)
              await deleteFromFirebase(msg.fileUrl);
              console.log(`File deleted from GCS: ${msg.fileUrl}`);
            } catch (delErr) {
              console.error("Error deleting file from GCS:", delErr);
            }
          }

          // Finish and return
          return callback(null, 'Message deleted from Redis buffer');
        }
      }

      // If not found in Redis, try MongoDB
      if (!foundInRedis) {
        console.log("Redis buffer not found, checking MongoDB...");

        // Try fetching from MongoDB
        msg = await Message.findById(messageId);
        if (!msg) {
          console.log("Message not found in DB:", messageId);
          return callback("Message not found");
        }

        // Enforce deletion rules for "forEveryone" deletion type (applies to file messages too)
        if (data.deleteType === "forEveryone") {
          const messageAge = moment().diff(moment(msg.sentAt), "minutes");
          if (messageAge >= 7) {
            return callback("Deletion time window expired");
          }
        }

        // Optional file deletion (if file type and deleteType is "forEveryone")
        if (msg.type === "file" && msg.fileUrl && data.deleteType === "forEveryone") {
          try {
            // Assuming deleteFromFirebase deletes a file from Google Cloud Storage (GCS)
            await deleteFromFirebase(msg.fileUrl);
            console.log(`File deleted from GCS: ${msg.fileUrl}`);
          } catch (delErr) {
            console.error("Error deleting file from GCS:", delErr);
          }
        }

        // Update chat lobby last message to "deleted"
        const deletedText = "<i>*Message Deleted*</i>";
        const now = new Date();
        const updated = await ChatLobby.findOneAndUpdate(
          { chatLobbyId: msg.chatLobbyId },
          {
            $set: {
              lastmsg: deletedText,
              lastmsgid: null,
              lastUpdated: now,
            }
          },
          { new: true }
        );

        // Notify all clients of the lobby update
        io.emit('lobbyUpdated', {
          chatLobbyId: updated.chatLobbyId,
          lastmsg: updated.lastmsg,
          lastmsgid: updated.lastmsgid,
          lastUpdated: updated.lastUpdated,
        });

        // Final delete from MongoDB
        await Message.findByIdAndDelete(messageId);

        // Notify clients in the chat lobby that the message has been deleted
        io.to(msg.chatLobbyId).emit('messageDeleted', { messageId: messageId });

        // Finish
        callback(null, "Message deleted from MongoDB");
      }
    } catch (err) {
      console.error("Error deleting message:", err);
      callback("Error deleting message");
    }
  });





  // — DELETE tribe message —
  socket.on('deleteTribeMessage', async (data, callback) => {
    try {
      const msg = await TribeMessage.findById(data.messageId);
      if (!msg) return callback("Message not found");

      if (msg.type === "file" && msg.fileUrl && data.deleteType === "forEveryone") {
        try {
          await deleteFromFirebase(msg.fileUrl);
          console.log(`File deleted from GCS: ${msg.fileUrl}`);
        } catch (delErr) {
          console.error("Error deleting tribe file from GCS:", delErr);
        }
      }

      await TribeMessage.findByIdAndDelete(data.messageId);
      io.to(msg.chatLobbyId).emit('tribeMessageDeleted', { messageId: data.messageId });
      callback(null, "Tribe message deleted");
    } catch (err) {
      console.error("Error deleting tribe message:", err);
      callback("Error deleting message");
    }
  });

  // Listen for typing event
  socket.on('typing', (data) => {
    const user = users.getUser(socket.id);
    if (user) {
      // Emit to everyone in the room that the user is typing
      socket.to(user.room).emit('userTyping', {
        userId: user.userId,
      });
    }
  });

  // Listen for stopTyping event
  socket.on('stopTyping', (data) => {
    const user = users.getUser(socket.id);
    if (user) {
      // Emit to everyone in the room that the user has stopped typing
      socket.to(user.room).emit('userStoppedTyping', {
        userId: user.userId,
      });
    }
  });

};