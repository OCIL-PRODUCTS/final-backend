import JWT from "jsonwebtoken";
import Boom from "@hapi/boom"; // Preferred
import redis from "../clients/redis";

const signAccessToken = (data) => {
  return new Promise((resolve, reject) => {
    const payload = { ...data };
    const options = {
      expiresIn: "10d",
      issuer: "ecommerce.app",
    };

    JWT.sign(payload, process.env.JWT_SECRET, options, (err, token) => {
      if (err) {
        console.error("Error signing access token:", err);
        return reject(Boom.internal("Could not create access token"));
      }
      resolve(token);
    });
  });
};

const verifyAccessToken = (req, res, next) => {
  const authorizationHeader = req.headers["authorization"];

  // Check if there is an authorization header
  if (!authorizationHeader) {
    // No token provided, allow access as guest
    return next();
  }

  const token = authorizationHeader.split(" ")[1]; // Expecting "Bearer <token>"
  
  if (!token) {
    // Token is present but invalid format, allow access as guest
    return next();
  }

  // Verify the token
  JWT.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      let message = "Invalid token";
      if (err.name === "TokenExpiredError") {
        message = "Token has expired";
      }
      console.error("Token verification error:", err);
      // Allow access as guest even if token is invalid
      return next();
    }

    // Token is valid, attach decoded payload to req object
    req.payload = payload; 
    next();
  });
};

const signRefreshToken = (user_id) => {
  return new Promise((resolve, reject) => {
    const payload = { user_id };
    const options = {
      expiresIn: "180d",
      issuer: "ecommerce.app",
    };

    JWT.sign(payload, process.env.JWT_REFRESH_SECRET, options, (err, token) => {
      if (err) {
        console.error("Error signing refresh token:", err);
        return reject(Boom.internal("Could not create refresh token"));
      }

      redis.set(user_id, token, "EX", 180 * 24 * 60 * 60); // Store in Redis
      resolve(token);
    });
  });
};

const verifyRefreshToken = async (refresh_token) => {
  return new Promise(async (resolve, reject) => {
    if (!refresh_token) {
      return reject(Boom.unauthorized("Refresh token not provided"));
    }

    JWT.verify(refresh_token, process.env.JWT_REFRESH_SECRET, async (err, payload) => {
      if (err) {
        let message = "Invalid refresh token";
        if (err.name === "TokenExpiredError") {
          message = "Refresh token has expired";
        }
        console.error("Refresh token verification error:", err);
        return reject(Boom.unauthorized(message));
      }

      const { user_id } = payload;
      const user_token = await redis.get(user_id);

      if (!user_token || refresh_token !== user_token) {
        return reject(Boom.unauthorized("Invalid refresh token"));
      }

      resolve(user_id);
    });
  });
};

export {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
};
