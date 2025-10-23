const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const SupportSchema = new Schema({
  support: {
    type: [String], // Array of sizes
  },
  courses: {
    type: [String], // Array of sizes
  },
  tools: {
    type: [String], // Array of sizes
  },
});

const Support = mongoose.model('categories', SupportSchema);

export default Support;
