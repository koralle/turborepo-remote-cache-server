import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

export {
  account,
  apikey,
  passkey,
  repositories,
  session,
  user,
  verification,
} from "./schema.ts";

export const createDb = (d1: D1Database) => drizzle(d1, { schema });

export type Database = ReturnType<typeof createDb>;
