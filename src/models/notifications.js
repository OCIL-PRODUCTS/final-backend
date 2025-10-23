const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Define the Notification schema
const NotificationSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  type: {
    type: [String],
    required: true,
  },
  data: {
    type: [String],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Create and export the Notification model
const Notification = mongoose.model("Notification", NotificationSchema);
module.exports = Notification;
