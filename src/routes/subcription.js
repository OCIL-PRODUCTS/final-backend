import express from 'express';
import {
  createSubscriptionController,
  downgradeController,
  cancelController,
  upgradeController,
  applyDiscountController
} from '../controllers/subscription/index.js';

const router = express.Router();

router.post('/create', createSubscriptionController);
router.post('/downgrade', downgradeController);
router.post('/cancel', cancelController);
router.post('/upgrade', upgradeController);
router.post('/apply-discount', applyDiscountController);

export default router;