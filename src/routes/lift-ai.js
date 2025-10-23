import express from "express";
import { verifyAccessToken } from "../helpers/jwt.js";
import liftAiController from "../controllers/lift-ai";

const router = express.Router();

router.post("/chat", verifyAccessToken, liftAiController.chat);
router.get("/prompt", verifyAccessToken, liftAiController.getPrompt);
router.get("/getAllPrompts", verifyAccessToken, liftAiController.getAllPrompts);
router.put("/prompt", verifyAccessToken, liftAiController.updatePrompt);
router.get("/tokens/:userId",verifyAccessToken, liftAiController.getUserTokens);
router.post('/reset-session', liftAiController.resetSession);

export default router;