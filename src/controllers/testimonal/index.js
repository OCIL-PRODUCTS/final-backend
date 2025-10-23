import Testimonal from "../../models/testimonals";
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

class TestimonalController {
  // Add a new testimonial
  static async addTestimonal(req, res, next) {
    try {
      if (!req.files || !req.files.img) {
        return next(Boom.badRequest("No testimonial image file provided."));
      }

      const file = req.files.img[0];
      const uploadedUrl = await handleFirebaseUpload(file, "Testimonals", "testimonal");
      const { name, testimonal } = req.body;
      const newTestimonal = new Testimonal({
        img: uploadedUrl,
        name,
        testimonal,
      });

      await newTestimonal.save();
      res.status(201).json(newTestimonal);
    } catch (error) {
      console.error("Error adding testimonial:", error);
      next(Boom.internal("Error adding testimonial"));
    }
  }

  // Get all testimonials
  static async getAllTestimonals(req, res, next) {
    try {
      const testimonals = await Testimonal.find();
      res.json(testimonals);
    } catch (error) {
      console.error("Error fetching testimonials:", error);
      next(Boom.internal("Error fetching testimonials"));
    }
  }

  // Update a testimonial
  static async updateTestimonal(req, res, next) {
    try {
      const { id } = req.params;
      const { name, testimonal } = req.body;

      const existingTestimonal = await Testimonal.findById(id);
      if (!existingTestimonal) {
        return next(Boom.notFound("Testimonial not found."));
      }

      if (req.files && req.files.img) {
        const file = req.files.img[0];
        const uploadedUrl = await handleFirebaseUpload(file, "Testimonals", "testimonal");

        if (existingTestimonal.img) {
          await deleteFromFirebase(existingTestimonal.img);
        }
        existingTestimonal.img = uploadedUrl;
      }

      existingTestimonal.name = name || existingTestimonal.name;
      existingTestimonal.testimonal = testimonal || existingTestimonal.testimonal;

      await existingTestimonal.save();
      res.json(existingTestimonal);
    } catch (error) {
      console.error("Error updating testimonial:", error);
      next(Boom.internal("Error updating testimonial"));
    }
  }

  // Delete a testimonial
  static async deleteTestimonal(req, res, next) {
    try {
      const { id } = req.params;

      const existingTestimonal = await Testimonal.findById(id);
      if (!existingTestimonal) {
        return next(Boom.notFound("Testimonial not found."));
      }

      if (existingTestimonal.img) {
        await deleteFromFirebase(existingTestimonal.img);
      }

      await existingTestimonal.deleteOne();
      res.json({ message: "Testimonial deleted successfully." });
    } catch (error) {
      console.error("Error deleting testimonial:", error);
      next(Boom.internal("Error deleting testimonial"));
    }
  }
}

module.exports = TestimonalController;
