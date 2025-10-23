const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const ImageSchema = new Schema({
  landingimg: {
    type: String, // Array of sizes
  },
  landingminiimg: {
    type: String, // Array of sizes
  },
  dashboardimg: {
    type: String, // Array of sizes
  },
});

const Image = mongoose.model('images', ImageSchema);

export default Image;
