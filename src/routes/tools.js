import express from "express";
import multer from "multer";
import { 
  createTool, 
  updateTool, 
  deleteTool, 
  getToolById, 
  getAllTools, 
  getAllToolsUsers,
  getToolsByCategory, 
  updateToolStatus 
} from "../controllers/tools";
import grantAccess from "../middlewares/grantAccess";
import { verifyAccessToken } from "../helpers/jwt";

const router = express.Router();

// Set up Multer for handling multiple files
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Accept thumbnail + multiple files
const toolUpload = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "files", maxCount: 5 },
]);

// Create a tool with file and thumbnail support
router.post(
  "/",
  verifyAccessToken,
  grantAccess("createAny", "tool"),
  toolUpload,
  createTool
);

// Update a tool with new files
router.put(
  "/edit/:toolId",
  verifyAccessToken,
  grantAccess("updateAny", "tool"),
  toolUpload,
  updateTool
);

// Bulk update: change status for multiple tools (expects req.body.toolIds and req.body.newStatus boolean)
router.put(
  "/update-status",
  verifyAccessToken,
  grantAccess("updateAny", "tool"),
  updateToolStatus
);

router.delete(
  "/:toolId",
  verifyAccessToken,
  grantAccess("deleteAny", "tool"),
  deleteTool
);
router.get("/admin-tools",verifyAccessToken, getAllTools);
router.get("/user-tools", getAllToolsUsers);
router.get("/:toolId", getToolById);
router.get("/category/:category", getToolsByCategory);

export default router;
