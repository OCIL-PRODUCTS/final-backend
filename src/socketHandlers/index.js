// src/socketHandlers/index.jsx
import { registerChatHandlers } from './chatHandlers.js';
import { registerPrivateHandlers } from './privateHandlers.js';
import { registerFileHandlers } from './fileHandlers.js';
import { registerAudioCallHandlers } from './audioHandlers.js';

export const registerSocketHandlers = (socket, io) => {
  registerChatHandlers(socket, io);
  registerPrivateHandlers(socket, io);
  registerFileHandlers(socket, io);
  registerAudioCallHandlers(socket, io);
};
