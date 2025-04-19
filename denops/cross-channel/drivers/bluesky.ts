import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import type { SNSDriver } from "../driver.ts";
import { authenticateBluesky } from "../auth.ts";
import { postToBluesky } from "../post.ts";

/**
 * Bluesky用ドライバ
 */
export const BlueskyDriver: SNSDriver = {
  key: "bluesky",
  authenticate: authenticateBluesky,
  post: postToBluesky,
};
