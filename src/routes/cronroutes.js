import express from "express";
const router = express.Router();
const { updateSaleStatusCron } = require('../middlewares/cronjobs'); // Import the cron job function

// Endpoint to manually trigger the cron job
router.get('/run-cron', async (req, res) => {
  try {
    await updateSaleStatusCron();  // Trigger the cron job function
    res.json({ message: 'Cron job triggered successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error triggering cron job.', error });
  }
});

module.exports = router;