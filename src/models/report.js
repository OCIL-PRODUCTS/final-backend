const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MytriberSchema = new Schema({
  type: {
    type: String,
    required: true,
  },
  // Array of member IDs (references to User)
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  Description: {
    type: String,
    required: true,
  },
}, { timestamps: true });

const Mytriber = mongoose.model("support", MytriberSchema);
module.exports = Mytriber;
