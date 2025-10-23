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

// Define the ChatLobby schema
const ChatLobbySchema = new Schema({
  chatLobbyId: {
    type: String,
    required: true,
    unique: true, // Ensures each chat lobby has a unique identifier
  },
  seen: {
    type: Boolean,
  },
  lastmsg: {
    type: String,
  },
  lastmsgid: {
    type: Schema.Types.ObjectId, // Now stores message _id
  },
  participants: [{
    type: Schema.Types.ObjectId,
    ref: 'User', // References to the User model
    required: true,
  }],
  deletefor: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  messages: [MessageSchema], // Array of messages between the participants
  lastUpdated: {
    type: Date,
    default: Date.now, // Sets the default value to the current date/time
  }
});


// Create and export the ChatLobby model
const ChatLobby = mongoose.model("ChatLobby", ChatLobbySchema);
module.exports = ChatLobby;
