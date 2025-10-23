import Tool from "../../models/tools";
import User from "../../models/user.js";
import Boom from "@hapi/boom"; // Preferred
import Notification from "../../models/notifications.js";
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

/**
 * Create a new tool.
 */
export const createTool = async (req, res, next) => {
  try {
    const { title, toolCategory, shortdescription, description, content, externalLink } = req.body;
    
    // Parse heading and details arrays (sent as JSON strings)
    const price_heading = req.body.price_heading ? JSON.parse(req.body.price_heading) : [];
    const price = req.body.price ? JSON.parse(req.body.price) : [];

    let thumbnailUrl;
    if (req.files && req.files["thumbnail"]) {
      thumbnailUrl = await handleFirebaseUpload(
        req.files["thumbnail"][0],
        "Thumbnail",
        `Tool-${title}-thumbnail`
      );
    } else {
      return next(Boom.badRequest("Thumbnail file is required."));
    }

    // Check if price_heading and price arrays are of the same length
    if (price_heading.length !== price.length) {
      return next(Boom.badRequest("Price headings and prices must have the same length."));
    }

    const tool = new Tool({
      title,
      thumbnail: thumbnailUrl,
      toolCategory,
      shortdescription,
      price_heading,
      price,
      description,
      content,
      externalLink,
    });

    const savedTool = await tool.save();

    // --- Notification Logic for Tool Creation ---
    const notificationData = `New tool '${title}' has been created.`;
    // Retrieve all users' IDs.
    const users = await User.find({}, "_id");

    if (users.length) {
      const bulkOperations = users.map(user => ({
        updateOne: {
          filter: { user: user._id },
          update: {
            $setOnInsert: { user: user._id },
            $push: {
              type: { $each: ["toolcreate"] },
              data: { $each: [notificationData] }
            }
          },
          upsert: true
        }
      }));

      await Notification.bulkWrite(bulkOperations);
    } else {
      console.warn("No users found to send tool creation notification.");
    }
    // --- End Notification Logic ---

    res.status(201).json(savedTool);
  } catch (error) {
    console.error("Error creating tool:", error);
    next(Boom.internal("Error creating tool."));
  }
};



/**
 * Update an existing tool by ID.
 */
export const updateTool = async (req, res, next) => {
  try {
    const { toolId } = req.params;
    const tool = await Tool.findById(toolId);
    if (!tool) {
      return next(Boom.notFound("Tool not found."));
    }

    // 1) Update primitive fields
    const {
      title,
      toolCategory,
      shortdescription,
      description,
      content,
      externalLink,
    } = req.body;

    tool.title           = title;
    tool.toolCategory    = toolCategory;
    tool.shortdescription= shortdescription;
    tool.description     = description;
    tool.content         = content;
    tool.externalLink    = externalLink;

    // 2) Parse and overwrite price_heading & price
    const parseArrayField = (field) => {
      if (Array.isArray(field)) return field;
      if (typeof field === "undefined" || field === "") return [];
      try {
        return JSON.parse(field);
      } catch {
        return [field];
      }
    };
    const price_heading = parseArrayField(req.body.price_heading);
    const price = Array.isArray(req.body.price)
      ? req.body.price
      : req.body.price !== undefined && req.body.price !== null
        ? [req.body.price]
        : [];

    if (price_heading.length !== price.length) {
      return next(Boom.badRequest("price_heading and price must have same length."));
    }
    tool.price_heading = price_heading;
    tool.price         = price;

    // 3) Handle thumbnail replacement
    if (req.files?.thumbnail?.length) {
      // delete old
      if (tool.thumbnail) {
        await deleteFromFirebase(tool.thumbnail);
      }
      // upload new
      const thumbFile = req.files.thumbnail[0];
      const newThumbUrl = await handleFirebaseUpload(
        thumbFile,
        "Thumbnail",
        `Tool-${title}-thumb`
      );
      tool.thumbnail = newThumbUrl;
    }

    // 4) Save
    const saved = await tool.save();

    // 5) Notify users of update
    const notificationText = `Tool '${title}' was updated.`;
    const users = await User.find({}, "_id");
    if (users.length) {
      const ops = users.map(u => ({
        updateOne: {
          filter: { user: u._id },
          update: {
            $setOnInsert: { user: u._id },
            $push: {
              type:   { $each: ["toolupdate"] },
              data:   { $each: [notificationText] }
            }
          },
          upsert: true
        }
      }));
      await Notification.bulkWrite(ops);
    }

    return res.json(saved);
  } catch (error) {
    console.error("Error updating tool:", error);
    return next(Boom.internal("Error updating tool."));
  }
};

/**
 * Delete an existing tool by ID.
 * Optionally deletes associated files from Firebase.
 */
export const deleteTool = async (req, res, next) => {
  try {
    const { toolId } = req.params;
    const tool = await Tool.findById(toolId);

    if (!tool) {
      return next(Boom.notFound("Tool not found."));
    }

    // Optionally delete associated files from Firebase Storage
    if (tool.thumbnail) {
      await deleteFromFirebase(tool.thumbnail);
    }

    await Tool.findByIdAndDelete(toolId);
    res.json({ message: "Tool deleted successfully." });
  } catch (error) {
    console.error("Error deleting tool:", error);
    next(Boom.internal("Error deleting tool."));
  }
};

/**
 * Get a tool by its ID.
 */
export const getToolById = async (req, res, next) => {
  try {
    const { toolId } = req.params;
    const tool = await Tool.findById(toolId);

    if (!tool) {
      return next(Boom.notFound("Tool not found."));
    }

    res.json(tool);
  } catch (error) {
    console.error("Error fetching tool:", error);
    next(Boom.internal("Error fetching tool."));
  }
};

/**
 * Get all tools.
 */
export const getAllTools = async (req, res, next) => {
  try {
    const tools = await Tool.find({});
    res.json(tools);
  } catch (error) {
    console.error("Error fetching tools:", error);
    next(Boom.internal("Error fetching tools."));
  }
};
export const getAllToolsUsers = async (req, res, next) => {
  try {
    const tools = await Tool.find({ status: true }).select(
      "title thumbnail toolCategory status price shortdescription"
    );
    res.json(tools);
  } catch (error) {
    console.error("Error fetching tools:", error);
    next(Boom.internal("Error fetching tools."));
  }
};


/**
 * Get tools by category.
 */
export const getToolsByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const tools = await Tool.find({ toolCategory: category });
    res.json(tools);
  } catch (error) {
    console.error("Error fetching tools by category:", error);
    next(Boom.internal("Error fetching tools by category."));
  }
};

/**
 * Update status of multiple tools.
 * Expects req.body.toolIds (array of IDs) and req.body.newStatus (boolean).
 */
export const updateToolStatus = async (req, res, next) => {
  try {
    const { toolIds, newStatus } = req.body;
    const updated = await Tool.updateMany(
      { _id: { $in: toolIds } },
      { $set: { status: newStatus } }
    );
    res.json({ message: "Tool status updated successfully.", updated });
  } catch (error) {
    console.error("Error updating tool status:", error);
    next(Boom.internal("Error updating tool status."));
  }
};

export default {
  createTool,
  updateTool,
  deleteTool,
  getToolById,
  getAllTools,
  updateToolStatus,
  getToolsByCategory,
};
