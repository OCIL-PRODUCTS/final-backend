import Report from "../../models/support"; // Your model file exporting the Mytriber (support) model
import Boom from "@hapi/boom"; // Preferred

/**
 * Create a new report.
 * Expects fields: type, members (optional array), Description, and (optionally) status.
 * If status is not provided, it defaults to "pending".
 */
export const createReport = async (req, res, next) => {
  try {
    const { type, user, Description, status } = req.body;

    if (!type || !Description) {
      return next(Boom.badRequest("Type and Description are required."));
    }

    // Generate a unique 6-digit ticket number (tickno)
    let tickno;
    let digits = 6;
    let uniqueFound = false;
    
    while (!uniqueFound) {
      // Calculate the minimum and maximum numbers for the current digit length.
      const min = Math.pow(10, digits - 1);
      const max = Math.pow(10, digits) - 1;
    
      // Check if all possible numbers in this range are already taken.
      const rangeCount = await Report.countDocuments({ tickno: { $gte: min, $lte: max } });
      const totalPossible = max - min + 1;
      if (rangeCount >= totalPossible) {
        // All numbers for this digit length are taken, increase the digit count.
        digits++;
        continue;
      }
    
      // Generate a random number within the current range.
      tickno = Math.floor(Math.random() * (max - min + 1)) + min;
    
      // Check if the generated tickno already exists.
      const reportExists = await Report.findOne({ tickno });
      if (!reportExists) {
        uniqueFound = true;
      }
    }
    
    

    const report = new Report({
      type,
      tickno, // Assign the generated ticket number
      user: user || [], // In your model, user is expected to be an ObjectId
      status: status || "pending", // Default status is "pending"
      Description,
    });

    const savedReport = await report.save();
    res.status(201).json(savedReport);
  } catch (error) {
    console.error("Error creating report:", error);
    next(Boom.internal("Error creating report."));
  }
};

/**
 * Update an existing report by ID.
 */
export const updateReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const updateData = req.body;
    const updatedReport = await Report.findByIdAndUpdate(reportId, updateData, { new: true });
    if (!updatedReport) {
      return next(Boom.notFound("Report not found."));
    }
    res.json(updatedReport);
  } catch (error) {
    console.error("Error updating report:", error);
    next(Boom.internal("Error updating report."));
  }
};

/**
 * Delete an existing report by ID.
 */
export const deleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId);

    if (!report) {
      return next(Boom.notFound("Report not found."));
    }

    await Report.findByIdAndDelete(reportId);
    res.json({ message: "Report deleted successfully." });
  } catch (error) {
    console.error("Error deleting report:", error);
    next(Boom.internal("Error deleting report."));
  }
};

/**
 * Get a report by its ID.
 */
export const getReportById = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId);

    if (!report) {
      return next(Boom.notFound("Report not found."));
    }

    res.json(report);
  } catch (error) {
    console.error("Error fetching report:", error);
    next(Boom.internal("Error fetching report."));
  }
};

/**
 * Get all reports with user details (username and subscription).
 */
export const getAllReports = async (req, res, next) => {
  try {
    const reports = await Report.find({}).populate('user', 'username subscription email');
    res.json(reports);
  } catch (error) {
    console.error("Error fetching reports:", error);
    next(Boom.internal("Error fetching reports."));
  }
};

/**
 * Update status of multiple reports.
 * Expects req.body.reportIds (array of IDs) and req.body.newStatus (string).
 */
export const updateReportStatus = async (req, res, next) => {
  try {
    const { reportIds, newStatus } = req.body;
    const updated = await Report.updateMany(
      { _id: { $in: reportIds } },
      { $set: { status: newStatus } }
    );
    res.json({ message: "Report status updated successfully.", updated });
  } catch (error) {
    console.error("Error updating report status:", error);
    next(Boom.internal("Error updating report status."));
  }
};

export const updateReportNote = async (req, res, next) => {
  try {
    const { reportId, newNote } = req.body;
    const updated = await Report.findByIdAndUpdate(
      reportId,
      { $set: { Note: newNote } },
      { new: true } // return the updated report
    );
    if (!updated) {
      return res.status(404).json({ message: "Report not found" });
    }
    res.json({ message: "Report note updated successfully.", updated });
  } catch (error) {
    console.error("Error updating report note:", error);
    next(Boom.internal("Error updating report note."));
  }
};


// controllers/support.js
export const getReportsForUser = async (req, res, next) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return next(Boom.unauthorized("User ID is required."));
    }
    const reports = await Report.find({ user: userId });
    return res.json({ reports });
  } catch (error) {
    console.error("Error fetching reports for user:", error);
    return next(Boom.internal("Error fetching reports for user."));
  }
};


export const getStatusForUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return next(Boom.badRequest("User ID is required."));
    }
    // Find all reports for the given user ID, selecting only the "status" field.
    const reports = await Report.find({ user: userId }, "status");
    res.json(reports);
  } catch (error) {
    console.error("Error fetching report status for user:", error);
    next(Boom.internal("Error fetching report status for user."));
  }
};

export const getLastFourReports = async (req, res, next) => {
  try {
    const latestReports = await Report.find({})
      .sort({ createdAt: -1 }) // Sort by newest first
      .limit(4)
      .populate("user", "username profile_pic"); // Only fetch username and profilePic from User

    res.status(200).json({
      success: true,
      reports: latestReports,
    });
  } catch (error) {
    console.error("Error fetching last four reports:", error);
    next(Boom.internal("Failed to fetch recent reports."));
  }
};

export default {
  createReport,
  updateReport,
  deleteReport,
  getReportById,
  getAllReports,
  updateReportNote,
  updateReportStatus,
  getReportsForUser,
  getStatusForUser,
  getLastFourReports,
};