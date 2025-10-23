const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PriceSchema = new Schema(
  {
    small: {
      price: { type: Number, required: true, default: 0.0 },
      tokens: { type: Number, required: true, default: 0.0 },
    },
    large: {
      price: { type: Number, required: true, default: 0.0 },
      tokens: { type: Number, required: true, default: 0.0 },
    },
    custom: {
      price: { type: Number, required: true, default: 1.2 },
      tokens: { type: Number, required: true, default: 1 },
    },
    basic: {
      perMonth: {
        price: { type: Number, required: true, default: 0.0 },
        tokens: { type: Number, required: true, default: 0.0 },
      },
      perYear: {
        price: { type: Number, required: true, default: 0.0 },
        tokens: { type: Number, required: true, default: 0.0 },
      },
    },
    premium: {
      perMonth: {
        price: { type: Number, required: true, default: 0.0 },
        tokens: { type: Number, required: true, default: 0.0 },
      },
      perYear: {
        price: { type: Number, required: true, default: 0.0 },
        tokens: { type: Number, required: true, default: 0.0 },
      },
    },
    Characterpertoken: {
      type: Number, required: true, default: 0.0,
    },
    FinalDiscount: {
      type: Number, required: true, default: 0.0,
    },
    BasicDiscount: {
      type: Number, required: true, default: 0.0,
    },
    PremiumDiscount: {
      type: Number, required: true, default: 0.0,
    },
  },
  { timestamps: true }
);

const Price = mongoose.model("Price", PriceSchema);
module.exports = Price;
