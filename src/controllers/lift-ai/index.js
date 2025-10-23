import LiftAi from "../../models/lift-ai.js";
import Price    from "../../models/price.js";
import Boom from "@hapi/boom"; // Preferred
import redis    from "../../clients/redis.js";
import User     from "../../models/user.js";
import Prompts  from "../../models/userprompts.js";
import { handleUserInput } from "../bA";

export const chat = async (req, res, next) => {
  try {
    const { message, userId, userSub } = req.body;
    if (!userId) {
      return next(Boom.badRequest("userId is required"));
    }

    // 1) Fetch pricing config
    const pricingConfig = await Price.findOne();
    if (!pricingConfig) {
      return next(Boom.internal("Pricing configuration not found"));
    }

    // 2) Pull out all three discount settings
    const finalDiscount   = pricingConfig.FinalDiscount   || 0;
    const basicDiscount   = pricingConfig.BasicDiscount   || 0;
    const premiumDiscount = pricingConfig.PremiumDiscount || 0;

    // 3) Choose discount by subscription tier
    let discountPercent;
    switch (userSub) {
      case "basic":
        discountPercent = basicDiscount;
        break;
      case "premium":
        discountPercent = premiumDiscount;
        break;
      default:
        discountPercent = finalDiscount;
    }
    const discountMultiplier = 1 - discountPercent / 100;

    // 4) Compute how many tokens the incoming message costs
    const characterPerToken    = pricingConfig.Characterpertoken || 4;
    const tokensForMessage     = Math.ceil(message.length / characterPerToken);
    const discountedMsgTokens  = Math.ceil(tokensForMessage * discountMultiplier);

    // 5) Make sure user has enough tokens
    const userDoc = await User.findById(userId);
    if (!userDoc) {
      return next(Boom.notFound("User not found"));
    }
    if ((userDoc.tokens || 0) < discountedMsgTokens) {
      return res.json({
        reply: "Don't have enough tokens. Please buy more at <a href=\"/profile/buy-tokens\">Buy Now</a>."
      });
    }

    // 6) Call your AI handler
    const reply = await handleUserInput(userId, message);

    // 7) If it’s a file-download reply
    if (typeof reply === "object" && reply.downloadUrl) {
      return res.json({ downloadUrl: reply.downloadUrl });
    }

    // 8) Compute total tokens used (in + out), and apply discount again
    const totalChars      = message.length + reply.length;
    const tokensUsed      = Math.ceil(totalChars / characterPerToken);
    const discountedTotal = Math.ceil(tokensUsed * discountMultiplier);

    // 9) Record usage in Prompts (15-minute window)
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const now             = Date.now();
    let lastPrompt        = await Prompts.findOne({ user: userId })
                                         .sort({ createdAt: -1 })
                                         .exec();

    let promptDoc;
    if (!lastPrompt || now - lastPrompt.createdAt.getTime() > FIFTEEN_MINUTES) {
      promptDoc = new Prompts({
        user:       userId,
        tokens_used: tokensUsed,
        createdAt:  new Date(),
        updatedAt:  new Date(),
      });
    } else {
      lastPrompt.tokens_used += tokensUsed;
      lastPrompt.updatedAt = new Date();
      promptDoc = lastPrompt;
    }
    await promptDoc.save();

    // 10) Deduct from the user’s account
    userDoc.tokens = Math.max(0, (userDoc.tokens || 0) - discountedTotal);
    await userDoc.save();

    // 11) Return both the reply and usage info
    return res.json({
      reply,
      tokensUsed,
      totalTokensUsed: promptDoc.tokens_used,
      discountApplied: discountPercent + "%",    // for debugging/UI
    });
  }
  catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: "Error processing your request" });
  }
};


// Get LiftAi prompt data. Always fetches from the database.
export const getPrompt = async (req, res, next) => {
  try {
    const liftAiDoc = await LiftAi.findOne();
    if (!liftAiDoc) {
      return next(Boom.notFound("Prompt data not found"));
    }
    return res.status(200).json({ success: true, data: liftAiDoc });
  } catch (error) {
    return next(Boom.internal("Error fetching LiftAi prompt data", error));
  }
};

// PUT /api/lift-ai/prompt
export const updatePrompt = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return next(Boom.badRequest("`prompt` is required and must be a non-empty string."));
    }

    let liftAiDoc = await LiftAi.findOne();
    if (!liftAiDoc) {
      liftAiDoc = new LiftAi({ prompt: prompt.trim() });
    } else {
      liftAiDoc.prompt = prompt.trim();
    }

    await liftAiDoc.save();
    const keys = await redis.keys("ba:memory:*");
    if (keys.length) await redis.del(...keys);
    return res.status(200).json({ success: true, data: liftAiDoc });
  } catch (error) {
    return next(Boom.internal("Error updating LiftAi prompt data", error));
  }
};

// Get user tokens for a given user by ID.
const getUserTokens = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return next(Boom.notFound("User not found"));
    }
    return res.status(200).json({ success: true, tokens: user.tokens || 0 });
  } catch (error) {
    console.error("Error fetching user tokens:", error);
    return next(Boom.internal("Error retrieving user tokens", error));
  }
};

// Get all conversation prompts for a given user.
const getAllPrompts = async (req, res, next) => {
  try {
    const prompts = await Prompts.find()
      .populate("user", "username _id") // Populate user field with username and ID
      .lean(); // Convert to plain objects for easier manipulation

    return res.status(200).json({ success: true, data: prompts });
  } catch (error) {
    console.error("Error fetching all prompts:", error);
    return next(Boom.internal("Error retrieving all prompts", error));
  }
};

// Reset Redis session for a specific user
export const resetUserSession = async (userId) => {
  try {
    // Deleting Redis session associated with the user
    const memKey = `ba:memory:${userId}`;
    await redis.del(memKey);
    console.log(`Redis session for user ${userId} has been reset.`);
  } catch (err) {
    console.error("Error resetting Redis session:", err);
    throw new Error("Unable to reset session.");
  }
};

// POST route to reset the Redis session for a user
export const resetSession = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return next(Boom.badRequest("userId is required"));
    }

    // Call the function to reset Redis session
    await resetUserSession(userId);

    return res.status(200).json({ success: true, message: `Session for user ${userId} has been reset.` });
  } catch (err) {
    console.error("Error resetting session:", err);
    return next(Boom.internal("Error resetting session", err));
  }
};





export default { chat, getPrompt, updatePrompt, getUserTokens, getAllPrompts, resetSession };
