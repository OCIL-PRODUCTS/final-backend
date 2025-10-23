// models/Message.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  chatLobbyId: {
    type: String,
    required: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  deletedFor: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  message: {
    type: String,
    // For text messages this is required, but for file messages, it can be empty.
    required: function () {
      return this.type === 'text';
    }
  },
  reply_id: {
    type: Schema.Types.ObjectId,
    ref: 'Message', // Reference to the same Message model for replies
  },
  reply_userid: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the same Message model for replies
  },
  reply_media: {
    type: Boolean,
  },
  reply_username: {
    type: String,
  },
  reply: {
    type: String,
  },
  isreplymedia: {
    type: Boolean,
  },
  forward: {
    type: Boolean,
  },
  fileUrl: {
    type: String, // URL to the uploaded file (if any)
  },
  isImage: {
    type: Boolean,
    default: false,
  },
  isVideo: {
    type: Boolean,
    default: false,
  },
  isAudio: {
    type: Boolean,
    default: false,
  },
  isEdit: {
    type: Boolean,
    default: false,
  },
  callStatus: {
    type: String,
  },
  caption: {
    type: String,
  },
  type: {
    type: String,
    enum: ['text', 'file'],
    default: 'text'
  },
  seen: {
    type: Boolean,
    default: false,
  },
  edit:{
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

const Message = mongoose.model("Message", MessageSchema);
module.exports = Message;
