import express from "express";
import multer from "multer";
import { verifyAccessToken } from "../helpers/jwt";
import grantAccess from "../middlewares/grantAccess";
import TestimonalController from "../controllers/testimonal";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Add a new testimonial (expects a file in the field "img").
router.post(
  "/add",
  verifyAccessToken,
  grantAccess("createAny", "testimonal"),
  upload.fields([{ name: "img", maxCount: 1 }]),
  TestimonalController.addTestimonal
);

// Get all testimonials.
router.get("/get-all", TestimonalController.getAllTestimonals);

// Update a testimonial by ID (expects a file in the field "img" if updating image).
router.put(
  "/update/:id",
  verifyAccessToken,
  grantAccess("updateAny", "testimonal"),
  upload.fields([{ name: "img", maxCount: 1 }]),
  TestimonalController.updateTestimonal
);

// Delete a testimonial by ID.
router.delete(
  "/delete/:id",
  verifyAccessToken,
  grantAccess("deleteAny", "testimonal"),
  TestimonalController.deleteTestimonal
);

export default router;
