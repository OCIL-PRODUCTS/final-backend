import express from "express";
import { verifyAccessToken } from "../helpers/jwt";
import grantAccess from "../middlewares/grantAccess";
import NotificationController from "../controllers/notifications";

const router = express.Router();

// Send a notification to all users
router.post(
  "/send-to-all",
  verifyAccessToken,
  grantAccess("createAny", "notification"),
  NotificationController.sendNotificationToAllUsers
);

// Get notifications for the current user
router.get(
  "/get-user-notifications",
  verifyAccessToken,
  grantAccess("readOwn", "notification"),
  NotificationController.getUserNotifications
);

// Remove a selected notification item (requires { type, data } in the body)
router.post(
  "/remove-item",
  verifyAccessToken,
  grantAccess("updateOwn", "notification"),
  NotificationController.removeNotificationItem
);

// Remove all notifications for the current user
router.post(
  "/remove-all",
  verifyAccessToken,
  grantAccess("deleteOwn", "notification"),
  NotificationController.removeAllNotifications
);

export default router;
