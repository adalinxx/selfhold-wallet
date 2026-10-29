// /selfhold.js, as sites that load it from before Selfhold for Chrome joined
// it know it: Selfhold's window only, unless they say otherwise. New sites load
// /v1/selfhold.js, or @selfhold/web, where Selfhold for Chrome is used where
// it is installed.
import { selfhold as either, type Options } from "./client.ts";

export * from "./client.ts";
export const selfhold = (options: Options = {}) => either({ use: "window", ...options });
