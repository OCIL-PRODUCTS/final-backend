const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CourseSchema = new Schema({
  // Mongoose automatically adds an _id field.
  title: {
    type: String,
    required: true,
  },
  Author: {
    type: String,
    required: true,
  },
  AuthorLink: {
    type: String,
  },
  thumbnail: {
    type: String,
    required: true,
  },
  lessons: {
    type: Number,
  },
  courseCategory: {
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
  price: {
    type: String,
    required: true,
  },
  courseContent: {
    type: String,
  },
  bought: {
    type: Number,
    default: 0,
  },
  status: {
    type: Boolean,
    default: true,
  },
  files: [
    {
      lesson: { type:[Number] },   // Lesson title/name
      content: { type: [String] }   // File URL or identifier
    }
  ],

  videosLinks: [
    {
      lesson: { type:[Number] },   // Lesson title/name
      content: { type: [String] } 
    }
  ],

  assessmentLinks: [
    {
      lesson: { type:[Number] },   // Lesson title/name
      content: { type: [String] } 
    }
  ],

  externalLinks: [
    {
      lesson: { type:[Number] },   // Lesson title/name
      content: { type: [String] } 
    }
  ],

  referenceLinks: [
    {
      lesson: { type:[Number] },   // Lesson title/name
      content: { type: [String] } 
    }
  ],

}, { timestamps: true });

const Course = mongoose.model("Course", CourseSchema);
export default Course;