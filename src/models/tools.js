const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ToolSchema = new Schema({
  // Mongoose provides an _id by default, so no need for a separate id field.
  title: {
    type: String,
    required: true,
  },
  thumbnail: {
    type: String,
    required: true,
  },
  toolCategory: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  shortdescription: {
    type: String,
    required: true,
  },
  status: {
    type: Boolean,
    default:true,
  },
  content: {
    type: String,
  },
  price_heading:{
    type: [String],
  },
  price:{
    type: [String],
  },
  externalLink: {
    type: String,
    required: true,
  },
}, { timestamps: true });

const Tool = mongoose.model("Tool", ToolSchema);
export default Tool;
