import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

export interface MongoConnection {
  client: MongoClient;
  db: Db;
  close(): Promise<void>;
}

export async function connectMongo(uri: string, dbName: string): Promise<MongoConnection> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  return { client, db, close: () => client.close() };
}
