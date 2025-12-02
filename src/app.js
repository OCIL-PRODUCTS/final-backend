// src/index.js
import 'dotenv/config';
import './clients/db';
import express from 'express';
import Boom from "@hapi/boom";
import cors from 'cors';
import limiter from './rate-limiter';
import routes from './routes';
import mongoose from 'mongoose';
import './utils/subs.js';
import './utils/sub_cancel.js';
import './utils/news.js';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socketHandlers/index.js';
import { registerAudioCallHandlers } from './socketHandlers/audioHandlers.js';
import { user } from './utils/users';
import { Readable } from 'stream';

const app = express();
const httpServer = createServer(app);

// -----------------------------------------------------------------------------
// CORS CONFIG  (THE CRITICAL FIX)
// -----------------------------------------------------------------------------

const allowedOrigins = [
  "https://final-frontend-olive.vercel.app",
  "https://openpreneurs.business",
  "https://www.openpreneurs.business",
  "http://localhost:3000"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow mobile apps / curl
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// fallback CORS in case any response escapes middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  next();
});

// -----------------------------------------------------------------------------
// SOCKET.IO CONFIG
// -----------------------------------------------------------------------------

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  registerSocketHandlers(socket, io);
  registerAudioCallHandlers(socket, io, user);

  socket.on('disconnect', () => {
    if (user) {
      io.to(user.room).emit('updateUserList', user.getUserList(user.room));
    }
  });
});

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------

app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use("/Uploads", express.static(path.join(process.cwd(), "public", "Uploads")));

app.use("/downloads", express.static(path.join(process.cwd(), "public", "downloads")));

// -----------------------------------------------------------------------------
// PROXY DOWNLOAD ROUTE (fixed single version)
// -----------------------------------------------------------------------------

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

    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'application/octet-stream'
    );

    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);

  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

app.use(routes);

// -----------------------------------------------------------------------------
// 404 HANDLER
// -----------------------------------------------------------------------------

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/socket.io/')) {
    return next();
  }
  return next(Boom.notFound(`The requested route '${req.originalUrl}' does not exist.`));
});

// -----------------------------------------------------------------------------
// ERROR HANDLER
// -----------------------------------------------------------------------------

app.use((err, req, res, next) => {
  console.error(err);
  if (err.isBoom) {
    return res.status(err.output.statusCode).json(err.output.payload);
  }
  return res.status(500).json({ error: 'Internal Server Error' });
});

// -----------------------------------------------------------------------------
// MONGODB CONNECTION
// -----------------------------------------------------------------------------

const mongoURI = process.env.MONGO_URI;
let retries = 0;
const maxRetries = 5;
const retryDelay = 10000;

const connectWithRetry = () => {
  mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
    .then(() => console.log('MongoDB connected successfully'))
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

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------

httpServer.listen(4000, () => console.log('Server is running on port 4000'));

connectWithRetry();
