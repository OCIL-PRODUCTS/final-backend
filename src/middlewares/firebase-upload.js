import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import Boom from "@hapi/boom"; // Preferred

// Initialize GCS (will pick up GOOGLE_APPLICATION_CREDENTIALS)
const gcs = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
});
const bucket = gcs.bucket(process.env.GCS_BUCKET_NAME);

// Multer in‐memory storage (20 MB limit)
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// Helper: upload to GCS but keep the same function name
export const uploadFileToFirebase = (file) => {
  return new Promise(async (resolve, reject) => {
    if (!file) {
      return reject(new Error("No file provided"));
    }
    try {
      const fileName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
      const blob = bucket.file(fileName);

      const stream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: file.mimetype,
        },
      });

      stream.on('error', (err) => {
        reject(err);
      });

      stream.on('finish', async () => {
        // Option A: make public
        await blob.makePublic();

        // Construct public URL exactly like Firebase style
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(fileName)}`;
        resolve(publicUrl);
      });

      stream.end(file.buffer);
    } catch (err) {
      reject(err);
    }
  });
};

// Delete from GCS—keeping the same function name
export const deleteFromFirebase = async (photoUrl) => {
  try {
    const parts = photoUrl.split(`${bucket.name}/`);
    if (parts.length !== 2) {
      throw new Error(`Unexpected URL format: ${photoUrl}`);
    }
    const filePath = decodeURIComponent(parts[1]);
    await bucket.file(filePath).delete();
  } catch (err) {
    console.error('GCS deletion error:', err);
    throw Boom.internal(`Failed to delete ${photoUrl}: ${err.message}`);
  }
};
