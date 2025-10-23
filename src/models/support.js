const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MytriberSchema = new Schema({
  type: {
    type: String,
    required: true,
  },
  tickno: {
    type: Number,
    required: true,
  },
  // Array of member IDs (references to User)
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    default:"pending",
    required: true,
  },
  Description: {
    type: String,
    required: true,
  },
  Note: {
    type: String,
    default:"N/A",
  },
}, { timestamps: true });

const Mytriber = mongoose.model("support", MytriberSchema);
module.exports = Mytriber;
