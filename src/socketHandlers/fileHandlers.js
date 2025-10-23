// fileHandlers.js

import { users } from './usersInstance';
import mongoose from 'mongoose';
import Message from '../models/Message';
import TribeMessage from '../models/TribeMessage';
import multer from 'multer';
import User from '../models/user';
import { v4 as uuidv4 } from 'uuid';
import ChatLobby from '../models/chatlobby';
import { Storage } from '@google-cloud/storage';
import redis from '../clients/redis.js';

// ——————————————
// 1) Google Cloud Storage Setup
// ——————————————
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
// ——————————————
// 2) Multer Setup
// ——————————————
const memoryStorage = multer.memoryStorage();
export const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ——————————————
// 3) File Upload Helper
// ——————————————
/**
 * Upload a file buffer to GCS and return its public URL.
 * Kept name `uploadFileToFirebase` for backwards compatibility.
 */
export const uploadFileToFirebase = (file) => {
  return new Promise(async (resolve, reject) => {
    if (!file) {
      return reject(new Error("No file provided"));
    }

    try {
      // 1) Generate a unique file name
      const fileName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
      const blob = bucket.file(fileName);

      // 2) Stream the buffer into GCS
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: { contentType: file.mimetype },
      });

      blobStream.on('error', (err) => reject(err));

      blobStream.on('finish', async () => {
        // 4) Build public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(fileName)}`;
        resolve(publicUrl);
      });

      blobStream.end(file.buffer);
    } catch (err) {
      reject(err);
    }
  });
};

// ——————————————
// 4) Socket.IO File Handlers
// ——————————————
export const registerFileHandlers = (socket, io) => {

  // --- New File Message (1:1 chat) ---
  socket.on('newFileMessage', async (fileData, callback) => {
    const user = users.getUser(socket.id);
    if (!user || !fileData?.fileUrl) {
      return callback && callback("Invalid data");
    }

    try {
      // Validate user ID
      if (!mongoose.Types.ObjectId.isValid(user.userId)) {
        return callback("Invalid user ID");
      }
      const senderId = new mongoose.Types.ObjectId(user.userId);
      const msgId = new mongoose.Types.ObjectId();

      // Determine file type
      const imageRegex = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
      const videoRegex = /\.(mp4|mov|avi|mkv)(\?.*)?$/i;
      const isImage = fileData.mimetype?.startsWith('image/') ?? imageRegex.test(fileData.fileUrl);
      const isVideo = fileData.mimetype?.startsWith('video/') ?? videoRegex.test(fileData.fileUrl);

      let replyIdObj = null;
      let replyUserIdObj = null;
      if (fileData.reply_id && mongoose.Types.ObjectId.isValid(fileData.reply_id)) {
        replyIdObj = new mongoose.Types.ObjectId(fileData.reply_id);
      }
      if (fileData.reply_userid && mongoose.Types.ObjectId.isValid(fileData.reply_userid)) {
        replyUserIdObj = new mongoose.Types.ObjectId(fileData.reply_userid);
      }

      // Save message
      const msgDoc = new Message({
        _id: msgId,
        chatLobbyId: user.room,
        sender: senderId,
        message: "",
        fileUrl: fileData.fileUrl,
        isImage,
        caption: fileData.caption || "",
        isVideo,
        type: "file",
        sentAt: new Date(),
        reply_id: replyIdObj,
        reply_userid: replyUserIdObj,
        reply: (fileData.reply || ""),
        reply_username: (fileData.reply_username || ""),
        reply_media: fileData.reply_media,

      });
      await msgDoc.save();
      // Broadcast
      io.to(user.room).emit('newFileMessage', {
        from: user.name,
        url: fileData.fileUrl,
        sentAt: msgDoc.sentAt,
        isImage,
        isVideo,
        caption: fileData.caption || "",
        _id: msgId.toString(),
        reply_id: msgDoc.reply_id ? msgDoc.reply_id.toString() : null,
        reply_userid: msgDoc.reply_userid ? msgDoc.reply_userid.toString() : null,
        reply: msgDoc.reply || "",
        reply_username: (msgDoc.reply_username || ""),
        reply_media: msgDoc.reply_media,
      });

      let lastmsgText;
      if (isImage) {
        lastmsgText = "📷 Image";
      } else if (isVideo) {
        lastmsgText = "🎬 Video";
      } else {
        lastmsgText = "📎 File";
      }

      // Update the ChatLobby’s lastmsg and lastUpdated
      ChatLobby.findOneAndUpdate(
        { chatLobbyId: user.room },
        {
          $set: {
            deletefor: [],
            lastmsg: lastmsgText,
            lastUpdated: new Date(),
          }
        },
        { new: true }  // return the updated document
      )
        .then((updatedLobby) => {
          io.emit('lobbyUpdated', {
            chatLobbyId: updatedLobby.chatLobbyId,
            lastmsg: updatedLobby.lastmsg,
            lastUpdated: updatedLobby.lastUpdated,
          });
        })
        .catch(console.error);

      callback && callback();
    } catch (err) {
      console.error("Error saving file message:", err);
      callback && callback("Error saving file message");
    }
  });

  // --- New File Message (Tribe chat) ---
  // ----------------- tribeNewFileMessage (file) -----------------
  socket.on('tribeNewFileMessage', async (fileData, callback) => {
    const user = users.getUser(socket.id);
    if (!user || !fileData?.fileUrl) {
      return callback && callback("Invalid data");
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(user.userId)) {
        return callback("Invalid user ID");
      }
      const senderId = new mongoose.Types.ObjectId(user.userId);
      const msgId = new mongoose.Types.ObjectId();

      // Determine image/video flags
      const imageRegex = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
      const videoRegex = /\.(mp4|mov|avi|mkv)(\?.*)?$/i;
      const isImage = fileData.mimetype?.startsWith('image/') ?? imageRegex.test(fileData.fileUrl);
      const isVideo = fileData.mimetype?.startsWith('video/') ?? videoRegex.test(fileData.fileUrl);

      // Validate/convert reply ids (fileData comes from formData -> strings)
      let replyIdObj = null;
      let replyUserIdObj = null;
      if (fileData.reply_id && mongoose.Types.ObjectId.isValid(fileData.reply_id)) {
        replyIdObj = new mongoose.Types.ObjectId(fileData.reply_id);
      }
      if (fileData.reply_userid && mongoose.Types.ObjectId.isValid(fileData.reply_userid)) {
        replyUserIdObj = new mongoose.Types.ObjectId(fileData.reply_userid);
      }

      const msgDoc = new TribeMessage({
        _id: msgId,
        chatLobbyId: user.room,
        sender: senderId,
        senderUsername: user.name,
        message: "",
        fileUrl: fileData.fileUrl,
        caption: fileData.caption || "",
        isImage,
        isVideo,
        type: "file",
        sentAt: new Date(),
        // reply fields
        reply_id: replyIdObj,
        reply_userid: replyUserIdObj,
        reply: (fileData.reply || ""),
        reply_username: (fileData.reply_username || ""),
        reply_media: fileData.reply_media,
      });
      await msgDoc.save();

      io.to(user.room).emit('tribeNewFileMessage', {
        from: user.name,
        senderId: senderId.toString(),
        url: fileData.fileUrl,
        sentAt: msgDoc.sentAt,
        caption: fileData.caption || "",
        isImage,
        isVideo,
        _id: msgId.toString(),
        // reply payload
        reply_id: msgDoc.reply_id ? msgDoc.reply_id.toString() : null,
        reply_userid: msgDoc.reply_userid ? msgDoc.reply_userid.toString() : null,
        reply: msgDoc.reply || "",
        reply_username: (msgDoc.reply_username || ""),
        reply_media: msgDoc.reply_media,
      });

      callback && callback(null, msgDoc);
    } catch (err) {
      console.error("Error saving tribe file message:", err);
      callback && callback("Error saving file message");
    }
  });

  // --- Forward a file message (1:1) ---
  socket.on('forwardFileMessage', async (payload, callback) => {
    try {
      // Expect payload to contain: userId1, userId2, fileUrl, caption, mimetype, and optional reply fields
      const {
        name,
        userId1,
        userId2,
        fileUrl,
        isImage,
        isVideo,
      } = payload || {};

      if (!userId1 || !userId2 || !fileUrl) {
        console.error('Invalid input for forwarding file message');
        return callback && callback('Invalid input');
      }

      const timestamp = Date.now();
      const msgId = new mongoose.Types.ObjectId();

      // Find existing lobby between the two users (if any)
      let existingLobby = await ChatLobby.findOne({
        participants: { $all: [userId1, userId2] }
      });

      const chatLobbyId = existingLobby ? existingLobby.chatLobbyId : uuidv4();

      // Determine image/video flags (same logic as newFileMessage)
      const imageRegex = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
      const videoRegex = /\.(mp4|mov|avi|mkv)(\?.*)?$/i;

      // Create the forwarded file message document
      const newMessage = new Message({
        _id: msgId,
        chatLobbyId,
        sender: userId1,
        message: "",
        fileUrl,
        isImage,
        isVideo,
        type: "file",
        forward: true,
        sentAt: new Date(timestamp),
        // reply fields
      });

      await newMessage.save();

      // Broadcast the forwarded file message to the lobby (all clients in that room)
      io.to(chatLobbyId).emit('newFileMessage', {
        from: name,
        url: fileUrl,
        sentAt: newMessage.sentAt,
        isImage,
        type: "file",
        isVideo,
        _id: newMessage._id.toString(),
        forward: true,
        // reply payload as strings/null
      });

      // Choose lastmsg text based on file type
      let lastmsgText;
      if (isImage) lastmsgText = "📷 Image";
      else if (isVideo) lastmsgText = "🎬 Video";
      else lastmsgText = "📎 File";

      // Update or create chat lobby
      if (existingLobby) {
        existingLobby.lastmsg = lastmsgText;
        existingLobby.lastmsgid = newMessage._id;
        existingLobby.messages.push(newMessage._id);
        existingLobby.lastUpdated = Date.now();
        await existingLobby.save();

        io.emit('lobbyUpdated', {
          chatLobbyId: existingLobby.chatLobbyId,
          lastmsg: existingLobby.lastmsg,
          lastmsgid: existingLobby.lastmsgid,
          lastUpdated: existingLobby.lastUpdated,
        });

        // Respond to caller
        return callback && callback(null, {
          chatLobbyId: existingLobby.chatLobbyId,
          message: 'File forwarded to existing lobby and updated as the last message.',
        });
      }

      // No existing lobby: create new ChatLobby
      const newChatLobby = new ChatLobby({
        chatLobbyId,
        participants: [userId1, userId2],
        messages: [newMessage._id],
        lastmsg: lastmsgText,
        lastmsgid: newMessage._id,
        deletefor: [],
      });
      await newChatLobby.save();

      io.emit('lobbyUpdated', {
        chatLobbyId: newChatLobby.chatLobbyId,
        lastmsg: newChatLobby.lastmsg,
        lastmsgid: newChatLobby.lastmsgid,
        lastUpdated: newChatLobby.lastUpdated,
      });

      callback && callback(null, {
        chatLobbyId,
        message: 'File forwarded in a new lobby and set as the last message.',
      });

      // Send notifications to other participants (do not notify the sender)
      ChatLobby.findOne({ chatLobbyId })
        .then(async (lobby) => {
          if (!lobby?.participants) return;
          for (const participant of lobby.participants) {
            if (participant.toString() === userId1) continue;
            const other = await User.findById(participant);
            if (!other) continue;
            await Notification.updateOne(
              { user: participant },
              { $addToSet: { type: 'message', data: `New forwarded file from ${userId1}` } },
              { upsert: true }
            );
          }
        })
        .catch(console.error);

    } catch (err) {
      console.error("Error forwarding file message:", err);
      callback && callback('Error forwarding file message');
    }
  });


};
