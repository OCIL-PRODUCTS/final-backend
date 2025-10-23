const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const NewsSchema = new Schema({
  img: {
    type: [String], // Array of sizes
  },
  title: {
    type: [String], // Array of sizes
  },
  content: {
    type: [String], // Array of sizes
  },
  link: {
    type: [String], // Array of sizes
  },
});

const News = mongoose.model('news', NewsSchema);

export default News;
