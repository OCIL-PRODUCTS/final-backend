import express from "express";
import { updateUserDetails,getAllUsers } from "../controllers/users";

const router = express.Router();

// Update user fields (tokens, subscription, role, status, level)
router.put("/", getAllUsers);
router.put("/:userId", updateUserDetails);

export default router;
