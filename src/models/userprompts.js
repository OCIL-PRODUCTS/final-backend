const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserPromptSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  tokens_used: {
    type: Number, // Total tokens used in the session
    default: 0,
  },
  sessionActive: {
    type: Boolean,
    default: true, // Indicates whether the conversation session is still active
  }
}, { timestamps: true });

const UserPrompt = mongoose.model("UserPrompt", UserPromptSchema);
export default UserPrompt;
