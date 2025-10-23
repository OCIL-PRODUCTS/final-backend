import express from 'express';
import { verifyAccessToken, grantAccess } from '../helpers/jwt'; // adjust if you use RBAC
import discountCtrl from '../controllers/discount';
const router = express.Router();

// Create discount
router.post(
  '/',
  verifyAccessToken,
  discountCtrl.createDiscount
);

// Get all discounts
router.get(
  '/',
  verifyAccessToken,
  discountCtrl.getAllDiscounts
);

// Delete
router.delete(
  '/:discountId',
  verifyAccessToken,
  discountCtrl.deleteDiscount
);

router.post(
  '/validate',
  verifyAccessToken, // optional: remove if public
  discountCtrl.validateDiscount
);

export default router;
