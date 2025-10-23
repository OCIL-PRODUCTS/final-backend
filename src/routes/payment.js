import express from "express";
import { verifyAccessToken } from "../helpers/jwt.js"; // Optional, if you want to secure the routes
import payment from "../controllers/payment";

const router = express.Router();

// Create Payment Intent (public or secure as needed)
// router.post("/create-payment-intent", verifyAccessToken, payment.createPaymentIntent);
router.post("/create-payment-intent", payment.createPaymentIntent);

// Get all payments with an optional status filter
// e.g., GET /api/payments/all-payments?status=pending
router.get("/all-payments", payment.getAllPaymentsWithStatus);

// Get payments for a specific user with an optional status filter
// e.g., GET /api/payments/user-payments?userId=123&status=completed
router.get("/user-payments", payment.getUserPaymentsWithStatus);

// Update the status of a payment record
// e.g., PUT /api/payments/update-payment-status with JSON body { paymentId: "xxx", status: "completed" }
router.put("/update-payment-status", payment.updatePaymentStatus);

// Refund a payment
// e.g., POST /api/payments/refund-payment with JSON body { paymentId: "xxx" }
router.post("/refund-payment", payment.refundPayment);
router.post('/cancel', payment.cancelSubscription);
router.post('/change-card', payment.updatePaymentMethod);
router.post('/user-cancel', payment.cancelAnySubscription);
router.post('/validate-discount', payment.validateDiscountRoute);
router.post('/downgrade', payment.downgradeToBasic);
router.get("/revenue-stats", payment.getRevenueStats);

export default router;
