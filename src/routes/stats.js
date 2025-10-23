import express from 'express';
const router = express.Router();

import Dashboard from '../controllers/stats';

// Get total number of courses
router.get('/total-courses', Dashboard.getTotalCourses);

// Get total number of tools
router.get('/total-tools', Dashboard.getTotalTools);

// Get total number of users
router.get('/total-users', Dashboard.getTotalUsers);

// Get total logins in the last 7 days
router.get('/total-signup-last7days', Dashboard.getTotalSignupsLast7Days);

// Get total active tribes measured by status
router.get('/total-active-tribes', Dashboard.getTotalActiveTribes);

// Get random 5 tribers (full name, last name, username, profile_pic)
router.get('/random-tribers', Dashboard.getRandomTribers);

// Get top 8 tribes with most members
router.get('/top-tribes', Dashboard.getTopTribesWithMostMembers);

// Get random 7 courses
router.get('/random-courses', Dashboard.getRandomCourses);

// Get random 7 tools
router.get('/random-tools', Dashboard.getRandomTools);

export default router;
