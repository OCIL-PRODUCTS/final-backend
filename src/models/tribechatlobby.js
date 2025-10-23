const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the ChatLobby schema
const ChatLobbySchema = new Schema({
  chatLobbyId: {
    type: String,
    required: true,
    unique: true, // Ensures each chat lobby has a unique identifier
  },
  deletefor: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
});

// Create and export the ChatLobby model
const ChatLobby = mongoose.model("TribeChatLobby", ChatLobbySchema);
module.exports = ChatLobby;
