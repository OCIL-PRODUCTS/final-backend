import express from "express";
import multer from "multer";
import { verifyAccessToken } from "../helpers/jwt";
import grantAccess from "../middlewares/grantAccess";
import {
  createMytribe,
  updateMytribe,
  deleteMytribe,
  getMytribeById,
  getAllMytribes,
  getUsersMytribes,
  getTotalMembers,
  updateTribeStatus,
  rateTribe,
  addAdminToTribe,
  leaveTribe,
  getTribeMembers,
  getTribeMembersSearch,
  searchUsersTribes,
  joinTribe,
  removeAdminFromTribe,
  removeMemberFromTribe, blockUserFromTribe,
  getTribes,
  getTribeById,
  getTribeForUser,
  getUserDetails,
  createOrGetTribeChatLobby,
  getTribeChatMessages,
  getSpecificMytribes,
  getUserTribesByIds,
} from "../controllers/tribes";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Accept thumbnail + multiple files
const toolUpload = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);
// Route to block a user from a specific tribe.
router.post(
  "/:tribeId/block/:userId",
  verifyAccessToken,
  grantAccess("updateAny", "mytribe"),
  blockUserFromTribe
);

// Get tribe for a specific user.
router.get("/user/:userId", getTribeForUser);

// Get a specific tribe by tribe ID.
router.get("/get-tribe/:tribeId", getTribeById);


// Create a new Mytribe.
router.post(
  "/",
  verifyAccessToken,
  grantAccess("createAny", "mytribe"),
  toolUpload,
  createMytribe
);

// Update a Mytribe by ID.
router.put(
  "/:mytribeId",
  verifyAccessToken,
  grantAccess("updateAny", "mytribe"),
  toolUpload,
  updateMytribe
);

// Delete a Mytribe by ID.
router.delete(
  "/:mytribeId",
  verifyAccessToken,
  grantAccess("deleteAny", "mytribe"),
  deleteMytribe
);

// Get all Mytribes.
router.get("/get-admin", getAllMytribes);
router.get("/get-users", getUsersMytribes);
router.get("/get-user-id/:userId", getSpecificMytribes);
router.post("/get-tribes-by-ids", getUserTribesByIds);
// Route to join a tribe.
router.post("/join-tribe", verifyAccessToken, joinTribe);

// Route to leave a tribe.
router.post("/leave-tribe", verifyAccessToken, leaveTribe);
router.get("/search", searchUsersTribes);
// Route to get members of a specific tribe.
router.get("/tribe-members/:tribeId", verifyAccessToken, getTribeMembers);

// Route to remove a member from a tribe.
router.post("/remove-member", verifyAccessToken, removeMemberFromTribe);

// Get a Mytribe by its ID.
router.get("/user", verifyAccessToken, getTribes);
router.get("/:mytribeId", getMytribeById);
router.get("/user-data", verifyAccessToken, getUserDetails);

router.post("/:tribeId/admins", addAdminToTribe);
router.delete("/:tribeId/admins/:userId", removeAdminFromTribe);
router.get("/:tribeId/tribers", getTribeMembersSearch);


router.put(
  "/update-status",
  verifyAccessToken,
  grantAccess("updateAny", "tool"),
  updateTribeStatus
);

// Get total members for a specific Mytribe.
router.get(
  "/:mytribeId/total-members",
  verifyAccessToken,
  grantAccess("readAny", "mytribe"),
  getTotalMembers
);

router.post("/:tribeId/rate", rateTribe);

router.get("/tribe-lobby/:tribeId", createOrGetTribeChatLobby);

// Get tribe messages
router.get("/tribe-messages/:chatLobbyId", getTribeChatMessages);


export default router;
