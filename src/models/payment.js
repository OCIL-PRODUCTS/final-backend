const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PaymentSchema = new Schema({
  // Mongoose provides an _id by default, so no need for a separate id field.
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
  },
  course: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
  },
  paymentid: {
    type: String,
    required: true,
  },
  payment: {
    type: Number,
    required: true,
  },
  discount: {
    type: String,
  },
  discountValue: {
    type: String,
  },
  data: {
    type: String,
    required: true,
  },
  tokens: {
    type: String,
  },
  period: {
    type: String,
  },
  paymentIntentId:{
    type: String,
  },
  stripeSubscriptionId:{
    type: String,
  },
  status: {
    type: String,
    required: true,
  },
}, { timestamps: true });

const Payment = mongoose.model("payment", PaymentSchema);
export default Payment;
