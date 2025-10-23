import express from "express";
import multer from "multer";
import { 
  createCourse, 
  updateCourse, 
  deleteCourse, 
  getCourseById, 
  getAllCourses, 
  getCoursesByCategory, 
  updateCoursesPrice, 
  updateCourseStatus,
  getAllUserCourses,
  getCoursesByIds
} from "../controllers/courses";
import grantAccess from "../middlewares/grantAccess";
import { verifyAccessToken } from "../helpers/jwt";

const router = express.Router();

// Set up Multer for handling multiple files
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Accept thumbnail + multiple files
const courseUpload = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "files", maxCount: 5 },
]);

// Create a course with file and thumbnail support
router.post(
  "/",
  verifyAccessToken,
  grantAccess("createAny", "course"),
  courseUpload,
  createCourse
);

// Bulk update: change price for multiple courses
router.put(
  "/update-price",
  verifyAccessToken,
  grantAccess("updateAny", "course"),
  updateCoursesPrice
);

// Bulk update: change status for multiple courses (expects req.body.courseIds and req.body.newStatus boolean)
router.put(
  "/update-status",
  verifyAccessToken,
  grantAccess("updateAny", "course"),
  updateCourseStatus
);

// Update a single course with new files
router.put(
  "/edit/:courseId",
  verifyAccessToken,
  grantAccess("updateAny", "course"),
  courseUpload,
  updateCourse
);

router.delete(
  "/:courseId",
  verifyAccessToken,
  grantAccess("deleteAny", "course"),
  deleteCourse
);
router.get("/user-course", getAllUserCourses);
router.get("/:courseId", getCourseById);
router.get("/", getAllCourses);
router.get("/category/:category", getCoursesByCategory);
router.post("/user-courses", getCoursesByIds);


export default router;
