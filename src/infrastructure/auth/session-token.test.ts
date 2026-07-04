import { describe, expect, it } from "vitest";
import { decryptSessionToken, encryptSessionToken } from "./session-token";

const SECRET = "test-secret-at-least-32-bytes-long!!";

describe("encryptSessionToken / decryptSessionToken", () => {
  it("round-trips the session payload", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "30d",
    );
    const payload = await decryptSessionToken(token, SECRET);
    expect(payload).toMatchObject({ userId: "u1", username: "mahith" });
  });

  it("returns null for a tampered token", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "30d",
    );
    const tampered = token.slice(0, -2) + "xx";
    expect(await decryptSessionToken(tampered, SECRET)).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      "another-secret-also-32-bytes-long!!!",
      "30d",
    );
    expect(await decryptSessionToken(token, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = await encryptSessionToken(
      { userId: "u1", username: "mahith" },
      SECRET,
      "0s",
    );
    // ensure the expiry boundary has passed
    await new Promise((r) => setTimeout(r, 1100));
    expect(await decryptSessionToken(token, SECRET)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await decryptSessionToken("not-a-jwt", SECRET)).toBeNull();
    expect(await decryptSessionToken(undefined, SECRET)).toBeNull();
  });
});
