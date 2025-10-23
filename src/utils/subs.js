// jobs/subscriptionCron.js
import cron from 'node-cron';
import moment from 'moment-timezone';
import User from '../models/user.js'; // Adjust path if needed
import Notifications from '../models/notifications.js';
import fs from "fs";
import path from "path";

const downloadsRoot = path.join(process.cwd(), "public", "downloads");

function deleteOldFiles(dir, maxAgeMinutes = 15) {
  fs.readdir(dir, (err, subdirs) => {
    if (err) return;

    subdirs.forEach(sub => {
      const subPath = path.join(dir, sub);
      fs.readdir(subPath, (_, files) => {
        files.forEach(file => {
          const filePath = path.join(subPath, file);
          fs.stat(filePath, (_, stats) => {
            const ageMs = Date.now() - stats.mtimeMs;
            if (ageMs > maxAgeMinutes * 60 * 1000) {
              fs.unlink(filePath, () => console.log("🧹 Deleted:", filePath));
            }
          });
        });
      });
    });
  });
}


// Runs every day at midnight Canadian Central Time
cron.schedule('0 0 * * *', async () => {
  const now = moment().tz('America/Toronto'); // Canada Eastern Time Zone

  try {

    deleteOldFiles(downloadsRoot);
  } catch (err) {
    console.error('Error running subscription cron:', err);
  }
});

