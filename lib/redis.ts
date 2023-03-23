import IORedis from "ioredis";

if (!process.env.REDIS_URL)
    throw new ReferenceError("process.env.REDIS_URL is not defined");

let redis = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 10,
});

export default redis;
