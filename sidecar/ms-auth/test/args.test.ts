import { test, expect } from "bun:test";
import { parseArgs } from "../src/args";

test("parseArgs reads command and cache path", () => {
  expect(parseArgs(["token", "--cache", "/tmp/c.json"])).toEqual({
    command: "token",
    cachePath: "/tmp/c.json",
    deviceCode: false,
  });
});

test("parseArgs reads the device-code flag", () => {
  expect(parseArgs(["login", "--device-code", "--cache", "/x"])).toEqual({
    command: "login",
    cachePath: "/x",
    deviceCode: true,
  });
});

test("parseArgs accepts status without a cache path", () => {
  expect(parseArgs(["status"])).toEqual({
    command: "status",
    cachePath: undefined,
    deviceCode: false,
  });
});

test("parseArgs throws on an unknown command", () => {
  expect(() => parseArgs(["bogus"])).toThrow("Unknown command: bogus");
});

test("parseArgs throws when --cache has no path value", () => {
  expect(() => parseArgs(["token", "--cache", "--device-code"])).toThrow(
    "--cache requires a path value",
  );
});
