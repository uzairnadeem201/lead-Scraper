import "dotenv/config";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  console.log("Updating database schema...");

  try {
    // 1. Update user table
    await sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;`;
    await sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "password" text;`;
    await sql`ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL;`;
    
    // Add unique constraint separately to avoid errors if it exists
    try {
      await sql`ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");`;
    } catch (e: any) {
      if (e.code === '42710') {
        console.log("Unique constraint 'user_username_unique' already exists.");
      } else {
        throw e;
      }
    }

    console.log("Schema updated successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to update schema:", err);
    process.exit(1);
  }
}

main();
