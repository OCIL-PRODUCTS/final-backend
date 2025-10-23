const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MytriberSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  requests: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  admins: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }],
  shortDescription: {
    type: String,
    required: true,
  },
  longDescription: {
    type: String,
    required: true,
  },
  status: {
    type: Boolean,
    default: true,
  },
  ratings: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default:0,
    }
  }],
  blockedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  tribechatlobby: {
    type: Schema.Types.ObjectId,
    ref: 'GroupChatLobby',
  },
  tribechat: {
    type: String,
    required: true,
    unique: true,
  },
  messageSettings: {
    type: String,
    enum: ["admin", "all"],
    default: "all",
  },
  thumbnail: {
    type: String,
    required: true,
  },
  banner: {
    type: String,
    required: true,
  },
  tribeCategory: {
    type: String,
    required: true,
  },
  joinPolicy: {
    type: String,
    enum: ["open", "closed"],
    default: "open",
  },
  membersLimit: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

const Mytriber = mongoose.model("Mytribe", MytriberSchema);
module.exports = Mytriber;
