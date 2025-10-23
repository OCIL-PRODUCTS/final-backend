import Message from '../../models/Message';
import TribeMessage from '../../models/TribeMessage';
import redis from '../../clients/redis';

// DELETE FOR ME: Add current user id to the message's deletedFor array.
const deleteForMe = async (req, res, next) => {
  const { messageId } = req.params;
  if (!req.body.senderId) {
    return res.status(401).json({ error: "Unauthorized: No user payload" });
  }
  const { senderId } = req.body;

  try {
    // First, check Redis if the message exists
    const tempKey = `chat:buffer:${req.body.chatLobbyId}`; // Assuming you have chatLobbyId in the request body or params
    const bufferItems = await redis.lrange(tempKey, 0, -1);
    let messageFoundInRedis = false;

    for (const item of bufferItems) {
      const msg = JSON.parse(item);
      if (msg._id === messageId) {
        // 1️⃣ Remove from Redis buffer
        await redis.lrem(tempKey, 1, item);
        messageFoundInRedis = true;
        break;
      }
    }

    if (messageFoundInRedis) {
      console.log("Message found and deleted from Redis buffer");
    }

    // 2️⃣ Proceed with MongoDB update if not found in Redis or if found in Redis
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedFor: senderId } }, // add user id if not already present
      { new: true }
    );

    if (!updatedMessage) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Send back the updated message
    res.json(updatedMessage);

  } catch (e) {
    next(e);
  }
};


const deleteForMeTribe = async (req, res, next) => {
  const { messageId } = req.params;
  if (!req.body.senderId) {
    return res.status(401).json({ error: "Unauthorized: No user payload" });
  }
  const { senderId } = req.body;
  try {
    const updatedMessage = await TribeMessage.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedFor: senderId } }, // add user id if not already present
      { new: true }
    );
    if (!updatedMessage) {
      return res.status(404).json({ error: "Message not found" });
    }
    res.json(updatedMessage);
  } catch (e) {
    next(e);
  }
};

const markMessagesSeen = async (req, res) => {
  const { chatLobbyId } = req.params;
  try {
    // Fetch all messages in the chat lobby, oldest first.
    const messages = await Message.find({ chatLobbyId }).sort({ sentAt: 1 });
    const updateIds = [];

    // Loop through messages until a message with seen === true is found.
    for (const msg of messages) {
      if (!msg.seen) {
        updateIds.push(msg._id);
      } else {
        // Stop the loop if a message is already marked as seen.
        break;
      }
    }

    // Update the collected messages to mark them as seen.
    if (updateIds.length > 0) {
      await Message.updateMany({ _id: { $in: updateIds } }, { $set: { seen: true } });
    }

    return res.status(200).json({ message: "Messages marked as seen." });
  } catch (error) {
    console.error("Error marking messages as seen:", error);
    return res.status(500).json({ error: "Server error" });
  }
};


// DELETE FOR EVERYONE: Only allow the sender to remove the message completely if within 7 minutes.
const deleteForEveryone = async (req, res, next) => {
  const { messageId } = req.params;
  if (!req.payload || !req.payload.user_id) {
    return res.status(401).json({ error: "Unauthorized: No user payload" });
  }
  const { user_id } = req.payload;
  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    // Only the sender can delete for everyone.
    if (message.sender.toString() !== user_id) {
      return res.status(403).json({ error: "You are not authorized to delete for everyone" });
    }
    // Allow deletion only if the message was sent within the last 7 minutes.
    const now = new Date();
    const diffMinutes = (now - new Date(message.sentAt)) / (1000 * 60);
    if (diffMinutes > 7) {
      return res.status(403).json({ error: "Message can no longer be deleted for everyone" });
    }
    await Message.findByIdAndDelete(messageId);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

export default {
  deleteForMe,
  deleteForEveryone,
  markMessagesSeen,
  deleteForMeTribe,
};
