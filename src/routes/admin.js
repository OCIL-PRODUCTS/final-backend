import express from 'express';
import {
  loginAdmin,
  createAdmin,
  getAllAdmins,
  deleteAdmin,
  updateAdminRole,
  updateAdminCredentials,
  RefreshToken,
  logoutAdmin,
  getCurrentAdmin
} from '../controllers/admin';
import { verifyAccessToken } from '../helpers/jwt';

const router = express.Router();

// Public routes
// Admin login
router.post('/login', loginAdmin);
router.post('/logout', logoutAdmin);
// Refresh admin tokens
router.post('/refresh_token', RefreshToken);


// Protected admin routes (requires valid access token)
// Create a new admin (only super-admins)
router.post(
  '/create',
  verifyAccessToken,
  createAdmin
);
router.get("/me", getCurrentAdmin);

// Get list of all admins
router.get(
  '/',
  getAllAdmins
);

// Update an admin's role
router.put(
  '/role',
  updateAdminRole
);

// Update admin credentials (username/password)
router.put(
  '/update',
  updateAdminCredentials
);

// Delete an admin
router.delete(
  '/:adminId',
  deleteAdmin
);

export default router;
