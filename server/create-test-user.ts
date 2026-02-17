import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { hashPassword } from "./lib/auth";
import { users } from "./schema/users";

async function createTestUser() {
  const email = "test@test.com";
  const username = "testuser";
  const plainPassword = "test1234";

  try {
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

    const hashedPassword = await hashPassword(plainPassword);

    if (existing.length > 0) {
      await db
        .update(users)
        .set({
          username,
          password: hashedPassword,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.email, email));

      console.log("Updated existing test user.");
    } else {
      await db.insert(users).values({
        id: randomUUID(),
        email,
        username,
        password: hashedPassword,
        isActive: true,
      });

      console.log("Created new test user.");
    }

    console.log("=== Test User Credentials ===");
    console.log(`Email: ${email}`);
    console.log(`Password: ${plainPassword}`);
    console.log("=============================");
  } catch (error) {
    console.error("Failed to create test user:", error);
    process.exitCode = 1;
  }
}

void createTestUser();
