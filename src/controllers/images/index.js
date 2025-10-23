const fs = require("fs");
const path = require("path");
import Boom from "@hapi/boom"; // Preferred
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

import Image from "../../models/images";
import User from "../../models/user";
import Tools from "../../models/tools";
import MyTribes from "../../models/mytribes";
import Course from "../../models/courses";

// Helper to save the image locally and return the URL
const saveImageLocally = async (file, folder, nameFormat) => {
  const uploadDir = path.join(__dirname, `../../public/Uploads/${folder}`);
  const ext = path.extname(file.originalname).toLowerCase();
  const fileName = `${nameFormat}-${uuidv4()}${ext}`;
  const fullPath = path.join(uploadDir, fileName);

  // Ensure the upload directory exists
  fs.mkdirSync(uploadDir, { recursive: true });

  const isVideo = ext === ".mp4" || ext === ".webm";

  if (isVideo) {
    // 🔁 Save video file directly
    fs.writeFileSync(fullPath, file.buffer);
  } else {
    // 🖼️ Process and save image using Sharp
    await sharp(file.buffer).toFile(fullPath);
  }

  // ✅ Return the relative path (used in frontend/public serving)
  return `/Uploads/${folder}/${fileName}`;
};

// Helper to delete image locally
const deleteLocalImage = (urlPath) => {
  try {
    const fullPath = path.join(__dirname, `../../public${urlPath}`);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.error("Failed to delete local image:", err);
  }
};

class ImageController {
  static async updateLandingImage(req, res, next) {
    try {
      if (!req.files || !req.files.landingimg) {
        return next(Boom.badRequest("No landing image file provided."));
      }
      const file = req.files.landingimg[0];
      const uploadedUrl = await saveImageLocally(file, "Banners", "landing");

      let imageDoc = await Image.findOne() || new Image();
      if (imageDoc.landingimg) deleteLocalImage(imageDoc.landingimg);

      imageDoc.landingimg = uploadedUrl;
      await imageDoc.save();
      res.json(imageDoc);
    } catch (error) {
      console.error("Error updating landing image:", error);
      next(Boom.internal("Error updating landing image", error));
    }
  }

  static async updateLandingMiniImage(req, res, next) {
    try {
      if (!req.files || !req.files.landingminiimg) {
        return next(Boom.badRequest("No landing mini image file provided."));
      }
      const file = req.files.landingminiimg[0];
      const uploadedUrl = await saveImageLocally(file, "Banners", "landingmini");

      let imageDoc = await Image.findOne() || new Image();
      if (imageDoc.landingminiimg) deleteLocalImage(imageDoc.landingminiimg);

      imageDoc.landingminiimg = uploadedUrl;
      await imageDoc.save();
      res.json(imageDoc);
    } catch (error) {
      console.error("Error updating landing mini image:", error);
      next(Boom.internal("Error updating landing mini image", error));
    }
  }

  static async updateDashboardImage(req, res, next) {
    try {
      if (!req.files || !req.files.dashboardimg) {
        return next(Boom.badRequest("No dashboard image file provided."));
      }
      const file = req.files.dashboardimg[0];
      const uploadedUrl = await saveImageLocally(file, "Banners", "dashboard");

      let imageDoc = await Image.findOne() || new Image();
      if (imageDoc.dashboardimg) deleteLocalImage(imageDoc.dashboardimg);

      imageDoc.dashboardimg = uploadedUrl;
      await imageDoc.save();
      res.json(imageDoc);
    } catch (error) {
      console.error("Error updating dashboard image:", error);
      next(Boom.internal("Error updating dashboard image", error));
    }
  }

  static async getLandingImage(req, res, next) {
    try {
      const imageDoc = await Image.findOne();
      if (!imageDoc?.landingimg) {
        return next(Boom.notFound("Landing image not found."));
      }
      res.json({ landingimg: imageDoc.landingimg });
    } catch (error) {
      next(Boom.internal("Error fetching landing image", error));
    }
  }

  static async getLandingMiniImage(req, res, next) {
    try {
      const imageDoc = await Image.findOne();
      if (!imageDoc?.landingminiimg) {
        return next(Boom.notFound("Landing mini image not found."));
      }
      res.json({ landingminiimg: imageDoc.landingminiimg });
    } catch (error) {
      next(Boom.internal("Error fetching landing mini image", error));
    }
  }

  static async getDashboardImage(req, res, next) {
    try {
      const imageDoc = await Image.findOne();
      if (!imageDoc?.dashboardimg) {
        return next(Boom.notFound("Dashboard image not found."));
      }
      res.json({ dashboardimg: imageDoc.dashboardimg });
    } catch (error) {
      next(Boom.internal("Error fetching dashboard image", error));
    }
  }

  static async getDashboardStats(req, res, next) {
    try {
      const userCount = await User.countDocuments();
      const tools = await Tools.countDocuments();
      const myTribesCount = await MyTribes.countDocuments();
      const coursesCount = await Course.countDocuments();

      res.json({
        userCount,
        myTribesCount,
        tools,
        coursesCount,
      });
    } catch (error) {
      next(Boom.internal("Error fetching dashboard stats", error));
    }
  }
}

module.exports = ImageController;
