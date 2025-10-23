import { unique } from "jquery";

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const Schema = mongoose.Schema;

const AdminSchema = new Schema({
  password: {
    type: String,
    required: true,
    toJSON: false,
  },
  username: {
    type: String,
    required: true,
    unique:true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  email: {
    type: String,
  },
  role: {
    type: String,
    default: "admin",
  },
  level: {
    type: String,
    default: "community",
    enum: ["community", "super","finance","ai"],
  },
});

AdminSchema.pre("save", async function (next) {
  try {
    // runs on both create *and* any time `password` is changed
    if (this.isModified("password")) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (error) {
    next(error);
  }
});


AdminSchema.methods.isValidPass = async function (pass) {
  return await bcrypt.compare(pass, this.password);
};

const Admin = mongoose.model("Admin", AdminSchema); // Ensure correct naming

export default Admin;
