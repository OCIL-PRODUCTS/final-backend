import Course from "../../models/user";
import User from "../../models/user";
import Boom from "@hapi/boom"; // Preferred
const { v4: uuidv4 } = require("uuid");
const { Storage } = require("@google-cloud/storage");

// Instantiate once (will pick up GOOGLE_APPLICATION_CREDENTIALS)
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID, // make sure this is set in .env
});
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);

// Function to upload files to Firebase and get the public URL
// Function to upload files to GCS and get the public URL
export const handleFirebaseUpload = async (file, folder, nameFormat) => {
  const fileName = `${nameFormat}-${uuidv4()}-${file.originalname}`;
  const filePath = `${folder}/${fileName}`;
  const blob = bucket.file(filePath);

  // Upload buffer
  await blob.save(file.buffer, {
    resumable: false,
    metadata: { contentType: file.mimetype },
  });
  // Return the public URL
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(filePath)}`;
};

export const deleteFromFirebase = async (publicUrl) => {
  try {
    // Extract the path after bucket name
    const parts = publicUrl.split(`${bucket.name}/`);
    if (parts.length !== 2) throw new Error(`Unexpected URL format: ${publicUrl}`);
    const filePath = decodeURIComponent(parts[1]);

    await bucket.file(filePath).delete();
  } catch (err) {
    console.error("GCS deletion error:", err);
    // Re-throw with original message for debugging
    throw new Error(`Failed to delete ${publicUrl}: ${err.message}`);
  }
};

export const updateUserDetails = async (req, res, next) => {
  try {
    const { userId } = req.params; // Extract userId from request params
    const { tokens, subscription, role, status, level } = req.body; // Data to update

    // Validate user input (Optional)
    const validSubscriptions = ["none", "basic", "premium"];
    const validRoles = ["user", "admin"];
    const validStatuses = ["active", "inactive", "suspended"];
    const validLevels = ["super", "admin", "moderator"];

    if (subscription && !validSubscriptions.includes(subscription)) {
      return next(Boom.badRequest("Invalid subscription type."));
    }
    if (role && !validRoles.includes(role)) {
      return next(Boom.badRequest("Invalid role."));
    }
    if (status && !validStatuses.includes(status)) {
      return next(Boom.badRequest("Invalid status."));
    }
    if (level && !validLevels.includes(level)) {
      return next(Boom.badRequest("Invalid level."));
    }

    // Build dynamic update object
    const updateData = {};
    if (tokens !== undefined) updateData.tokens = tokens;
    if (subscription) updateData.subscription = subscription;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (level) updateData.level = level;

    // Update the user and return the updated document
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Ensure Mongoose schema validations run
    });

    if (!updatedUser) {
      return next(Boom.notFound("User not found."));
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    next(Boom.internal("Error updating user."));
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    // Extract optional query parameters for filtering
    const { role, status, subscription, limit = 50, page = 1 } = req.query;

    // Build dynamic query object
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;
    if (subscription) query.subscription = subscription;

    // Pagination: Calculate skip value
    const skip = (page - 1) * limit;

    // Fetch users with filtering and pagination
    const users = await User.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-password -resetPasswordToken -resetPasswordExpires") // Exclude sensitive fields
      .populate("joined_tribes", "name") // Populate joined_tribes (optional)
      .populate("mytribers", "username email") // Populate mytribers (optional)
      .populate("chat_lobby", "name"); // Populate chat_lobby (optional)

    // Get total count for pagination metadata
    const totalUsers = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      totalUsers,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit),
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    next(Boom.internal("Error fetching users."));
  }
};


/**
 * Update an existing course by ID.
 */
export const updateCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const updateData = req.body;

    const updatedCourse = await Course.findByIdAndUpdate(courseId, updateData, { new: true });
    if (!updatedCourse) {
      return next(Boom.notFound("Course not found."));
    }

    res.json(updatedCourse);
  } catch (error) {
    console.error("Error updating course:", error);
    next(Boom.internal("Error updating course."));
  }
};

/**
 * Delete an existing course by ID.
 * Optionally deletes associated files from Firebase.
 */
export const deleteCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) {
      return next(Boom.notFound("Course not found."));
    }

    if (course.thumbnail) {
      await deleteFromFirebase(course.thumbnail);
    }
    if (course.files && course.files.length > 0) {
      for (const fileUrl of course.files) {
        await deleteFromFirebase(fileUrl);
      }
    }

    await Course.findByIdAndDelete(courseId);
    res.json({ message: "Course deleted successfully." });
  } catch (error) {
    console.error("Error deleting course:", error);
    next(Boom.internal("Error deleting course."));
  }
};

/**
 * Get a course by its ID.
 */
export const getCourseById = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);

    if (!course) {
      return next(Boom.notFound("Course not found."));
    }

    res.json(course);
  } catch (error) {
    console.error("Error fetching course:", error);
    next(Boom.internal("Error fetching course."));
  }
};

/**
 * Get all courses.
 */
export const getAllCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(Boom.internal("Error fetching courses."));
  }
};

export const getAllCoursesAdmin = async (req, res, next) => {
  try {
    const courses = await Course.find({});
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(Boom.internal("Error fetching courses."));
  }
};

export const updateCoursesPrice = async (req, res, next) => {
  try {
    const { courseIds, newPrice } = req.body;
    const updated = await Course.updateMany(
      { _id: { $in: courseIds } },
      { $set: { price: newPrice } }
    );
    res.json({ message: "Courses updated successfully.", updated });
  } catch (error) {
    console.error("Error updating courses price:", error);
    next(Boom.internal("Error updating courses price."));
  }
};


/**
 * Update status of multiple courses.
 * Expects req.body.courseIds (array of IDs) and req.body.newStatus (boolean).
 */
export const updateCourseStatus = async (req, res, next) => {
  try {
    const { courseIds, newStatus } = req.body;
    const updated = await Course.updateMany(
      { _id: { $in: courseIds } },
      { $set: { status: newStatus } }
    );
    res.json({ message: "Course status updated successfully.", updated });
  } catch (error) {
    console.error("Error updating course status:", error);
    next(Boom.internal("Error updating course status."));
  }
};

/**
 * Get courses by category.
 */
export const getCoursesByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const courses = await Course.find({ courseCategory: category });
    res.json(courses);
  } catch (error) {
    console.error("Error fetching courses by category:", error);
    next(Boom.internal("Error fetching courses by category."));
  }
};

export default {
  updateCourse,
  deleteCourse,
  getCourseById,
  getAllCourses,
  updateCourseStatus,
  getCoursesByCategory,
  updateCoursesPrice,
  updateUserDetails,
  getAllUsers,
};
