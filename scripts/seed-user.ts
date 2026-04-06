import "dotenv/config";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

async function main() {
  const username = process.env.SEED_USERNAME || "areeba";
  const password = process.env.SEED_PASSWORD || "areebamian123@";
  const hashedPassword = await bcrypt.hash(password, 10);

  console.log(`Creating user: ${username}...`);

  try {
    await db.insert(users).values({
      id: randomUUID(),
      username: username,
      password: hashedPassword,
      name: "Areeba",
    }).onConflictDoUpdate({
      target: users.username,
      set: { password: hashedPassword }
    });

    console.log("User 'areeba' created/updated successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating user:", error);
    process.exit(1);
  }
}

main();
