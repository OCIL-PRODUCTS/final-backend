import express from "express";
import multer from "multer";
import { verifyAccessToken } from "../helpers/jwt";
import grantAccess from "../middlewares/grantAccess";
import ImageController from "../controllers/images";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage,limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB
  } });

// Update landing image. Expects a file in the field "landingimg".
router.put(
  "/update-landing",
  verifyAccessToken,
  grantAccess("updateAny", "image"),
  upload.fields([{ name: "landingimg", maxCount: 1 }]),
  ImageController.updateLandingImage
);

// Update landing mini image. Expects a file in the field "landingminiimg".
router.put(
  "/update-landingmini",
  verifyAccessToken,
  grantAccess("updateAny", "image"),
  upload.fields([{ name: "landingminiimg", maxCount: 1 }]),
  ImageController.updateLandingMiniImage
);

router.put(
  "/update-dashboard",
  verifyAccessToken,
  grantAccess("updateAny", "image"),
  upload.fields([{ name: "dashboardimg", maxCount: 1 }]),
  ImageController.updateDashboardImage
);


// Get landing image.
router.get("/get-landing", ImageController.getLandingImage);

router.get("/get-stat-number", ImageController.getDashboardStats);

// Get landing mini image.
router.get("/get-landingmini", ImageController.getLandingMiniImage);

// (Optional) Get dashboard image.
router.get("/get-dashboard", ImageController.getDashboardImage);

export default router;
