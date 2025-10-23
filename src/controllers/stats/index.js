import User from "../../models/user.js";
import Payment from "../../models/payment.js"; // if needed
import Tools from "../../models/tools.js";
import Courses from "../../models/courses.js";
import Tribes from "../../models/mytribes.js";
import Boom from "@hapi/boom"; // Preferred

// Get total number of courses
const getTotalCourses = async (req, res, next) => {
  try {
    const totalCourses = await Courses.countDocuments();
    return res.status(200).json({ success: true, totalCourses });
  } catch (error) {
    return next(Boom.internal("Error fetching total courses", error));
  }
};

// Get total number of tools
const getTotalTools = async (req, res, next) => {
  try {
    const totalTools = await Tools.countDocuments();
    return res.status(200).json({ success: true, totalTools });
  } catch (error) {
    return next(Boom.internal("Error fetching total tools", error));
  }
};

// Get total number of users
const getTotalUsers = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    return res.status(200).json({ success: true, totalUsers });
  } catch (error) {
    return next(Boom.internal("Error fetching total users", error));
  }
};

// Get total logins in the last 7 days
// Assumes that your User model has a "lastLogin" Date field updated on login.
const getTotalSignupsLast7Days = async (req, res, next) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const totalSignups = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    return res.status(200).json({ success: true, totalSignupsLast7Days: totalSignups });
  } catch (error) {
    return next(Boom.internal("Error fetching signup data", error));
  }
};

// Get total active tribes measured by status (assumes status field is "active" for active tribes)
const getTotalActiveTribes = async (req, res, next) => {
  try {
    const totalActiveTribes = await Tribes.countDocuments({ status: true });
    return res.status(200).json({ success: true, totalActiveTribes });
  } catch (error) {
    return next(Boom.internal("Error fetching active tribes", error));
  }
};

// Get random 5 tribers (assumes User model has fullName, lastName, username, profile_pic)
const getRandomTribers = async (req, res, next) => {
  try {
    const randomTribers = await User.aggregate([
      { $sample: { size: 5 } },
      {
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          username: 1,
          aboutme:1,
          profile_pic: 1,
        },
      },
    ]);
    return res.status(200).json({ success: true, randomTribers });
  } catch (error) {
    return next(Boom.internal("Error fetching random tribers", error));
  }
};

// Get top 8 tribes with most members
// Assumes that the Tribes model has a "members" array field.
const getTopTribesWithMostMembers = async (req, res, next) => {
  try {
    const topTribes = await Tribes.aggregate([
      {
        $project: {
          _id:1,
          title: 1,
          members: 1,
          thumbnail:1,
          tribeCategory:1,
          memberCount: { $size: { $ifNull: ["$members", []] } },
        },
      },
      { $sort: { memberCount: -1 } },
      { $limit: 8 },
    ]);
    return res.status(200).json({ success: true, topTribes });
  } catch (error) {
    return next(Boom.internal("Error fetching top tribes", error));
  }
};

// Get random 7 courses
const getRandomCourses = async (req, res, next) => {
  try {
    const randomCourses = await Courses.aggregate([
      { $sample: { size: 7 } },
      {
        $project: {
          _id: 1,
          title: 1,
          courseCategory: 1,
          thumbnail: 1
        }
      }
    ]);
    return res.status(200).json({ success: true, randomCourses });
  } catch (error) {
    return next(Boom.internal("Error fetching random courses", error));
  }
};
const getRandomTools = async (req, res, next) => {
  try {
    const randomTools = await Tools.aggregate([
      { $sample: { size: 7 } },
      {
        $project: {
          _id: 1,
          title: 1,
          toolCategory: 1,
          thumbnail: 1
        }
      }
    ]);
    return res.status(200).json({ success: true, randomTools });
  } catch (error) {
    return next(Boom.internal("Error fetching random tools", error));
  }
};


export default {
  getTotalCourses,
  getTotalTools,
  getTotalUsers,
  getTotalSignupsLast7Days,
  getTotalActiveTribes,
  getRandomTribers,
  getTopTribesWithMostMembers,
  getRandomCourses,
  getRandomTools,
};
