const Redis = require('ioredis');

// Local Redis config
const redis = new Redis({
  host: '127.0.0.1', // or 'localhost'
  port: 6379,        // default Redis port
  // password: '',   // only needed if you set a password in redis.conf
});

redis.on('connect', () => {
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;