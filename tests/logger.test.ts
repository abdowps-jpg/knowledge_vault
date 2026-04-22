import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../server/lib/logger";

describe("logger", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    logSpy.mockClear();
    errSpy.mockClear();
  });

  afterEach(() => {
    // restore between envs
    (process.env as Record<string, string | undefined>).LOG_LEVEL = undefined;
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  it("emits info to stdout via console.log", () => {
    logger.info("user.login", { userId: "u1" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0];
    expect(String(line)).toContain("user.login");
    expect(String(line)).toContain('"userId":"u1"');
  });

  it("emits errors via console.error", () => {
    logger.error("db.failed", { table: "items" }, new Error("boom"));
    expect(errSpy).toHaveBeenCalledTimes(1);
    const [line] = errSpy.mock.calls[0];
    expect(String(line)).toContain("db.failed");
    expect(String(line)).toContain("boom");
  });

  it("redacts JWT-shaped strings in field values", () => {
    logger.info("auth.accepted", {
      token:
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMxMjMifQ.aaaaaaaaaaaaaaaaaaaaaa",
    });
    const line = String(logSpy.mock.calls[0][0]);
    // `token` is a suspect key so the whole field is redacted by key-name filter.
    expect(line).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("redacts api-key-shaped substrings (kv_...) in free-form fields", () => {
    logger.info("request.inbound", { ua: "kv_01234567890123456789ab clipper" });
    const line = String(logSpy.mock.calls[0][0]);
    expect(line).toContain("kv_REDACTED");
    expect(line).not.toContain("kv_01234567890123456789");
  });

  it("honors LOG_LEVEL to suppress lower-severity events", () => {
    (process.env as Record<string, string>).LOG_LEVEL = "warn";
    logger.info("noisy", {});
    logger.warn("quiet", {});
    // info suppressed, warn goes to console.error
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
