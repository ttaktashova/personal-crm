import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { runQuery } from "@/db";

// Smoke check for deploys: 200 when the app is up and can reach the database.
export async function GET() {
  // Answer every request live: never prerender this route at build time.
  await connection();

  try {
    await runQuery("healthCheck", (db) => db.execute(sql`select 1`));
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
