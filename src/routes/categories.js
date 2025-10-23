import express from "express";
import CategoryController from "../controllers/category";

const router = express.Router();

// Create or update the single category document
router.post("/", CategoryController.createOrUpdateCategory);

// Delete a specific value from an array
router.delete("/", CategoryController.deleteCategoryItem);

// Get arrays separately
router.get("/support", CategoryController.getSupportArray);
router.get("/courses", CategoryController.getCoursesArray);
router.get("/tools", CategoryController.getToolsArray);

export default router;
