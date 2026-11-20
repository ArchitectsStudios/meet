import { MongoClient, type Db } from "mongodb";
import type { AvailabilityDoc, MeetingDoc, UserDoc } from "./types";

const globalForMongo = globalThis as unknown as { __meetMongo?: Promise<MongoClient> };

/** One shared client per process. Survives Next.js hot reloads in development. */
export function getMongoClient(uri = process.env.MONGODB_URI): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!globalForMongo.__meetMongo) {
    globalForMongo.__meetMongo = MongoClient.connect(uri).then(async (client) => {
      await ensureIndexes(client.db());
      return client;
    });
    globalForMongo.__meetMongo.catch(() => {
      globalForMongo.__meetMongo = undefined;
    });
  }
  return globalForMongo.__meetMongo;
}

export async function getDb(): Promise<Db> {
  return (await getMongoClient()).db();
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>("users"),
    availability: db.collection<AvailabilityDoc>("availability"),
    meetings: db.collection<MeetingDoc>("meetings"),
  };
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection("users").createIndex({ discordId: 1 }, { unique: true }),
    db.collection("users").createIndex({ icsToken: 1 }, { unique: true, sparse: true }),
    db.collection("availability").createIndex({ discordId: 1 }, { unique: true }),
    db.collection("meetings").createIndex({ "guests.discordId": 1, start: 1 }),
    db.collection("meetings").createIndex({ organizerId: 1, start: 1 }),
    db.collection("meetings").createIndex({ status: 1, reminderSentAt: 1, start: 1 }),
  ]);
}
