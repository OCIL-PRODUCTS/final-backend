import express from "express";
import {
  createReport,
  updateReport,
  deleteReport,
  getReportById,
  getAllReports,
  updateReportStatus,
  updateReportNote,
  getReportsForUser,
  getLastFourReports,
} from "../controllers/support";
import grantAccess from "../middlewares/grantAccess";
import { verifyAccessToken } from "../helpers/jwt";

const router = express.Router();

// Create a new report
router.post(
  "/",
  verifyAccessToken,
  grantAccess("createAny", "report"),
  createReport
);

// Bulk update: change status for multiple reports (expects req.body.reportIds and req.body.newStatus)
router.put(
  "/update-status",
  verifyAccessToken,
  grantAccess("updateAny", "report"),
  updateReportStatus
);

router.put(
  "/update-note",
  verifyAccessToken,
  grantAccess("updateAny", "report"),
  updateReportNote
);


// Update a report by its ID
router.put(
  "/:reportId",
  verifyAccessToken,
  grantAccess("updateAny", "report"),
  updateReport
);


router.get(
  "/last4", // e.g., GET /api/report/user
  verifyAccessToken,
  getLastFourReports
);

// Delete a report by its ID
router.delete(
  "/:reportId",
  verifyAccessToken,
  grantAccess("deleteAny", "report"),
  deleteReport
);

// Get all reports
router.get("/", verifyAccessToken, getAllReports);
//router.get("/status/:userId", verifyAccessToken, getStatusForUser);

// Get a report by its ID
router.get(
  "/:reportId",
  verifyAccessToken,
  getReportById
);

router.get(
  "/user/:userId", // e.g., GET /api/report/user
  verifyAccessToken,
  getReportsForUser
);

export default router;
