import Notification from "../../models/notifications";
import User from "../../models/user";
import Boom from "@hapi/boom"; // Preferred

/**
 * Send a notification to all users.
 */
export const sendNotificationToAllUsers = async (req, res, next) => {
  try {
    const { data } = req.body; // Expecting { data: "New Announcement" }

    if (!data) {
      return res.status(400).json({ success: false, message: "Notification data is required." });
    }

    // Get all users
    const users = await User.find({}, "_id");

    if (!users.length) {
      return res.status(404).json({ success: false, message: "No users found." });
    }

    // Process each user to create/update notifications
    const bulkOperations = users.map(user => ({
      updateOne: {
        filter: { user: user._id },
        update: {
          $setOnInsert: { user: user._id },
          $push: { 
            type: { $each: ["announcement"] },
            data: { $each: [data] }
          }
        },
        upsert: true
      }
    }));

    await Notification.bulkWrite(bulkOperations);

    return res.status(200).json({ success: true, message: "Notification sent to all users." });
  } catch (error) {
    console.error("Error sending notification:", error);
    return next(Boom.internal("Error sending notifications."));
  }
};



/**
 * Get notifications for the current user.
 */
export const getUserNotifications = async (req, res, next) => {
  try {
    // Use userId from query if provided; otherwise use authenticated user's ID.
    const userId = req.query.userId || req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const notifications = await Notification.findOne({ user: userId });

    return res.status(200).json({
      success: true,
      data: notifications ? notifications : { type: [], data: "" }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return next(Boom.internal("Error fetching notifications."));
  }
};



/**
 * Remove a selected notification item for the current user.
 * Expects req.body to have `{ type: "announcement", data: "Some Announcement" }`.
 */
export const removeNotificationItem = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?._id || req.user?.id;
    const { type, data } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    if (!type || !data) {
      return res.status(400).json({ success: false, message: "Type and data are required." });
    }

    // Load the notification document for the user
    const notificationDoc = await Notification.findOne({ user: userId });
    if (!notificationDoc) {
      return res.status(404).json({ success: false, message: "Notification document not found." });
    }

    // Find the index where both type and data match exactly
    const index = notificationDoc.type.findIndex((t, i) => t === type && notificationDoc.data[i] === data);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Notification item not found." });
    }

    // Remove the elements at that index in both arrays
    notificationDoc.type.splice(index, 1);
    notificationDoc.data.splice(index, 1);

    await notificationDoc.save();

    return res.status(200).json({ success: true, message: "Notification item removed." });
  } catch (error) {
    console.error("Error removing notification item:", error);
    return next(Boom.internal("Error removing notification item."));
  }
};


/**
 * Remove all notifications for the current user.
 */
export const removeAllNotifications = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }
    // Remove the entire notification document for the user
    await Notification.deleteOne({ user: userId });
    return res.status(200).json({ success: true, message: "All notifications removed." });
  } catch (error) {
    console.error("Error removing all notifications:", error);
    return next(Boom.internal("Error removing all notifications."));
  }
};

export default {
  sendNotificationToAllUsers,
  getUserNotifications,
  removeNotificationItem,
  removeAllNotifications
};
