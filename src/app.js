// src/index.js
import 'dotenv/config';
import './clients/db';
import express from 'express';
import Boom from "@hapi/boom"; // Preferred
import cors from 'cors';
import limiter from './rate-limiter';
import routes from './routes';
import mongoose from 'mongoose';
import './utils/subs.js'; // Ensure correct path
import './utils/sub_cancel.js'; // Ensure correct path
import './utils/news.js'; // Ensure correct path
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers/index.js';
import { registerAudioCallHandlers } from './socketHandlers/audioHandlers.js';
import { user } from './utils/users';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ['https://openpreneurs.business','https://www.openpreneurs.business',"http://localhost:3000"], // Allowed domain
    methods: ["GET", "POST"]
  }
});

// Register socket handlers on connection
io.on('connection', (socket) => {
  registerSocketHandlers(socket, io);
  registerAudioCallHandlers(socket, io, user);

  socket.on('disconnect', () => {
    if (user) {
      io.to(user.room).emit('updateUserList', user.getUserList(user.room));
    }// Optionally, handle user removal from the Users instance here if needed.
  });
});

// Middleware
// Make sure this is before any of your routes, including /proxy-download:
app.use(cors({
  origin: ['https://openpreneurs.business',
           'https://www.openpreneurs.business',"http://localhost:3000"],
           methods: ["GET", "POST", "PUT", "OPTIONS","DELETE"],// include OPTIONS
  allowedHeaders: ["Origin","X-Requested-With",
                   "Content-Type","Accept","Authorization"]
}));

// Then your proxy-download route, untouched by manual CORS headers:
app.get('/proxy-download', async (req, res, next) => {
  const { fileUrl } = req.query;
  if (!fileUrl) {
    return res.status(400).json({ error: "Missing fileUrl query parameter" });
  }
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch file" });
    }
    // copy content-type from upstream
    res.setHeader('Content-Type',
                  response.headers.get('content-type') || 'application/octet-stream');

    // stream it down
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (error) {
    next(error);
  }
});


app.use(
  "/downloads",
  express.static(path.join(process.cwd(), "public", "downloads"))
);


app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use("/Uploads", express.static(path.join(__dirname, "public/Uploads")));

import { Readable } from 'stream';

app.get('/proxy-download', async (req, res, next) => {
  const { fileUrl } = req.query;
  if (!fileUrl) {
    return res.status(400).json({ error: "Missing fileUrl query parameter" });
  }
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch file" });
    }
    // copy content-type from upstream
    res.setHeader('Content-Type',
                  response.headers.get('content-type') || 'application/octet-stream');

    // stream it down
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
  } catch (error) {
    next(error);
  }
});
// API Routes
app.use(routes);

// Custom 404 Middleware
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/socket.io/')) {
    return next(); // Let Socket.io handle its own requests
  }
  return next(Boom.notFound(`The requested route '${req.originalUrl}' does not exist.`));
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err);
  if (err.isBoom) {
    return res.status(err.output.statusCode).json(err.output.payload);
  }
  return res.status(500).json({ error: 'Internal Server Error' });
});

// MongoDB Connection with Retry Logic
const mongoURI = process.env.MONGO_URI;
let retries = 0;
const maxRetries = 5;
const retryDelay = 10000; // 10 seconds

const connectWithRetry = () => {
  mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => ('Monconsole.loggoDB connected successfully'))
    .catch((err) => {
      console.error('MongoDB connection failed:', err);
      if (retries < maxRetries) {
        retries += 1;
        setTimeout(connectWithRetry, retryDelay);
      } else {
        console.error('Max retries reached. Running without database connection.');
      }
    });
};

httpServer.listen(4000, () => console.log('Server is running on port 4000'));

// Attempt initial MongoDB connection
connectWithRetry();
