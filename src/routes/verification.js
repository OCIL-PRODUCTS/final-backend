import express from 'express';
import verify from '../controllers/verification/index'; // Adjust path as needed

const router = express.Router();

router.get('/verify/:token', verify.verifyEmail);
router.post('/forgot-password', verify.forgotPassword);
router.post('/contactus', verify.sendContactEmail);
router.post('/reset-password/:token', verify.resetPassword);

export default router;