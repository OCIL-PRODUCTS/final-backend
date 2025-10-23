// models/lift-ai.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const LiftAiSchema = new Schema(
  {
    prompt: {
      type: String,
      default:null
    }
  },
  { timestamps: true }
);

const LiftAi = mongoose.model("LiftAi", LiftAiSchema);
export default LiftAi;
