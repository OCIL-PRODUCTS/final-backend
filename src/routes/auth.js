import express from 'express';
const router = express.Router();
import multer from "multer";

import auth from '../controllers/auth';
import { verifyAccessToken } from '../helpers/jwt';

// Public routes
router.post('/register', auth.Register);
router.post('/login', auth.Login);
router.post('/refresh_token', auth.RefreshToken);
router.post('/logout', auth.Logout);

router.get('/total-login/:rangeType', auth.GetTotalNumberOfRegistrationsByDateRange);

// Set up Multer storage configuration
const upload = multer({ storage: multer.memoryStorage() });

// Use field names "profile_pic" and "banner_image" as expected by the client
router.put(
  "/update-user-info",
  verifyAccessToken,
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "banner_image", maxCount: 1 }
  ]),
  auth.updateUserInfo
);


// Protected routes
router.put('/address', verifyAccessToken, auth.updateAddress);
router.get('/get-address',verifyAccessToken,auth.getAddress);
router.get('/me', verifyAccessToken, auth.Me);
router.post('/chat-lobby', verifyAccessToken, auth.getOrCreateChatLobby);
router.get('/get-chat-lobbies', verifyAccessToken, auth.getUserChatLobbies);
router.post("/create-chat-lobby", verifyAccessToken,auth.createChatLobby);
router.post("/forward",auth.forwardMessage);
router.get('/get-users',verifyAccessToken,auth.getAllUsers);
router.get('/chat-messages/:chatLobbyId', verifyAccessToken, auth.getChatMessages);
router.post('/delete-chat-for-user', verifyAccessToken, auth.deleteChatForUser);
router.put('/toggle-email-visibility', verifyAccessToken, auth.toggleEmailVisibility);


router.get('/adminusers', verifyAccessToken, auth.getAllAdminUsers);
router.put('/userupdate/:userId', verifyAccessToken, auth.updateUserAdminDetails);

router.post("/send-request", verifyAccessToken, auth.sendFriendRequest);

// Accept a friend request
router.put("/accept-request", verifyAccessToken, auth.acceptFriendRequest);
router.get("/friend-requests", verifyAccessToken, auth.getAllFriendRequests);
router.get("/friend-list", verifyAccessToken, auth.getAllFriendList);
router.get("/friendlist", verifyAccessToken, auth.getFriendList);
router.get("/chat-lobby", verifyAccessToken, auth.getChatLobby);
// Reject a friend request
router.put("/reject-request", verifyAccessToken, auth.rejectFriendRequest);

// Block a user
router.put("/block-user", verifyAccessToken, auth.blockUser);

// Unblock a user
router.put("/unblock-user", verifyAccessToken, auth.unblockUser);
router.put("/remove-friend", verifyAccessToken, auth.removeFriend);
router.put("/cancel-sent-request", verifyAccessToken,auth.cancelSentFriendRequest);
router.put("/remove-rejected-request", verifyAccessToken, auth.removeRejectedFriendRequest);
router.put("/update-password", verifyAccessToken, auth.updateUserPassword);
router.put("/update-user-media", verifyAccessToken, auth.updateUserMedia);
router.put("/update-username", verifyAccessToken, auth.updateUsername);
router.put("/remove-banner", verifyAccessToken, auth.removeUserBanner);

// Route to remove profile picture
router.put("/remove-profile-pic", verifyAccessToken, auth.removeUserProfilePic);
router.put("/tribes/join", verifyAccessToken, auth.joinTribe);
router.put("/tribes/leave", verifyAccessToken, auth.leaveTribe);

// Course endpoints
router.put("/courses/add", verifyAccessToken, auth.addCourse);
router.put("/courses/remove", verifyAccessToken, auth.removeCourse);

// Tool endpoints
router.put("/tools/add", verifyAccessToken, auth.addTool);
router.put("/tools/remove", verifyAccessToken, auth.removeTool);

// Delete user account
router.delete("/account", verifyAccessToken, auth.deleteAccount);
router.put("/accept-request", verifyAccessToken, auth.acceptTribeRequest);

// Route for tribe admins to reject a join request.
router.put("/reject-request", verifyAccessToken, auth.rejectTribeRequest);
router.get("/profile/:targetUserId", verifyAccessToken, auth.getUserProfileForChecker);
router.get("/tribes-profile", verifyAccessToken, auth.getUserProfileForUser);
router.get("/search-tribers", verifyAccessToken, auth.searchTribers);
router.get('/user-search', verifyAccessToken, auth.searchUsers);

// Route to get all courses for the current user
router.get("/courses", verifyAccessToken, auth.getAllCoursesForUser);

// Route to get all tribers for the current user
router.get("/tribers", verifyAccessToken, auth.getAllTribersForUser);

// Route to get all tribes for the current user
router.get("/tribes", verifyAccessToken, auth.getAllTribesForUser);
router.delete('/user/:id', verifyAccessToken, auth.deleteUser);
router.get("/check-duplicates",  auth.checkDuplicates);
// Route to get all blocked users for the current user
router.get("/blocked", verifyAccessToken, auth.getAllBlockedForUser);
router.get("/details/:tribeId", verifyAccessToken, auth.getTribeDetails);
router.delete('/chat-lobbies/:chatLobbyId', verifyAccessToken, auth.deleteChatLobbyForUser);

// New routes for blocking/unblocking a user from a tribe (admin-only)
router.put("/block-user", verifyAccessToken, auth.blockUserFromTribe);
router.put("/unblock-user", verifyAccessToken, auth.unblockUserFromTribe);
router.put("/kick-user", verifyAccessToken, auth.kickUserFromTribe);


// Route to get all members of a tribe
router.get("/members/:tribeId", verifyAccessToken, auth.getTribeMembers);
router.get(
  '/users/info',
  verifyAccessToken,
  auth.getUsersChatInfo
);

export default router;