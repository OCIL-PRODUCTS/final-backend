const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DiscountSchema = new Schema({
  value: {
    type: Number,
    required: true, // e.g., 10 for 10% or $10
  },
  token: {
    type: String,
    required: true, // unique token/code like "SAVE10"
    unique: true,
    trim: true,
  },
  for: {
    type: String,
    enum: ['tokens', 'subscription','course'],
    required: true,
  },
  period: {
    type: String,
    enum: ['year', 'month'],
  },
  subscription: {
    type: String,
    enum: ['basic', 'premium'],
  },
  numberOfUses: {
    type: Number,
    required: true,
  },
  used_by: [{
    type: String,
  }],
  usesCount: { type: Number, default: 0 }, // Add this field
}, { timestamps: true });

const Discount = mongoose.model("discount", DiscountSchema);
module.exports = Discount;
