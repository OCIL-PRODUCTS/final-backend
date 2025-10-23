import Category from "../../models/category"; // Your model file exporting the Category model
import Boom from "@hapi/boom"; // Preferred

/**
 * Create or update the single category document.
 */
export const createOrUpdateCategory = async (req, res, next) => {
  try {
    const { arrayName, value } = req.body; // Expecting `{ arrayName: "courses", value: "New Course" }`

    if (!arrayName || !value) {
      return res.status(400).json({ success: false, message: "Invalid request data" });
    }

    const category = await Category.findOneAndUpdate(
      {}, // Find the single category document
      { $addToSet: { [arrayName]: value } }, // Add value to array (prevent duplicates)
      { new: true, upsert: true } // Return updated document, create if not exists
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    return next(Boom.internal("Error updating category"));
  }
};


/**
 * Delete a specific value from an array in the category document.
 */
export const deleteCategoryItem = async (req, res, next) => {
  try {
    const { arrayName, value } = req.body;

    if (!arrayName || !value || !["support", "courses", "tools"].includes(arrayName)) {
      return next(Boom.badRequest("Invalid array name or value."));
    }

    const category = await Category.findOneAndUpdate(
      {},
      { $pull: { [arrayName]: value } },
      { new: true }
    );

    if (!category) {
      return next(Boom.notFound("Category not found."));
    }

    return res.status(200).json({
      success: true,
      message: "Item removed successfully.",
      data: category,
    });
  } catch (error) {
    console.error("Error deleting category item:", error);
    return next(Boom.internal("Error deleting category item"));
  }
};

/**
 * Get the support array from the category document.
 */
export const getSupportArray = async (req, res, next) => {
  try {
    const category = await Category.findOne({}, "support");

    if (!category) {
      return next(Boom.notFound("Category not found."));
    }

    return res.status(200).json({ success: true, data: category.support || [] });
  } catch (error) {
    console.error("Error fetching support array:", error);
    return next(Boom.internal("Error fetching support array"));
  }
};

/**
 * Get the courses array from the category document.
 */
export const getCoursesArray = async (req, res, next) => {
  try {
    const category = await Category.findOne({}, "courses");

    if (!category) {
      return next(Boom.notFound("Category not found."));
    }

    return res.status(200).json({ success: true, data: category.courses || [] });
  } catch (error) {
    console.error("Error fetching courses array:", error);
    return next(Boom.internal("Error fetching courses array"));
  }
};

/**
 * Get the tools array from the category document.
 */
export const getToolsArray = async (req, res, next) => {
  try {
    const category = await Category.findOne({}, "tools");

    if (!category) {
      return next(Boom.notFound("Category not found."));
    }

    return res.status(200).json({ success: true, data: category.tools || [] });
  } catch (error) {
    console.error("Error fetching tools array:", error);
    return next(Boom.internal("Error fetching tools array"));
  }
};

export default {
  createOrUpdateCategory,
  deleteCategoryItem,
  getSupportArray,
  getCoursesArray,
  getToolsArray,
};
