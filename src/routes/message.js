// messages.routes.js
import express from 'express';
import { verifyAccessToken } from '../helpers/jwt'; // This middleware sets req.payload
import messageController from '../controllers/message/index'; // Adjust path as needed

const router = express.Router();

// Existing routes.
router.post('/:messageId/delete-for-me', verifyAccessToken, messageController.deleteForMe);
router.post('/:messageId/delete-for-tribe', verifyAccessToken, messageController.deleteForMeTribe);
router.delete('/:messageId/delete-for-everyone', verifyAccessToken, messageController.deleteForEveryone);

// New route: mark messages as seen.
// When a chat lobby loads, this endpoint loops through the messages (oldest first)
// and updates the unseen messages to seen until it finds a message that is already seen.
router.patch('/:chatLobbyId/mark-seen', verifyAccessToken, messageController.markMessagesSeen);

export default router;
