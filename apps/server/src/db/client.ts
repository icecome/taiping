import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** 每个请求建一个轻量客户端；drizzle 实例无内部连接状态，可安全按请求创建。 */
export function createDb(d1: D1Database): Db {
  return drizzle(d1, { schema });
}

export { schema };
