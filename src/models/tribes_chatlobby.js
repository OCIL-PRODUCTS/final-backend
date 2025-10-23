const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define a sub-schema for individual messages
const MessageSchema = new Schema({
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

// Define the Group Chat Lobby schema for mytribers groups
const GroupChatLobbySchema = new Schema({
  // Reference to the mytribers group. This serves as the unique identifier for the chat lobby.
  mytribersId: {
    type: Schema.Types.ObjectId,
    ref: 'Mytribe', // Reference to the Mytriber model
    required: true,
    unique: true, // Ensures one chat lobby per mytribers group
  },
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  }],
  messages: [MessageSchema], // Array of message subdocuments
}, { timestamps: true });

const GroupChatLobby = mongoose.model("GroupChatLobby", GroupChatLobbySchema);
module.exports = GroupChatLobby;
