import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import type { SNSDriver } from "../driver.ts";
import { postToX } from "../post.ts";

/**
 * X.com用ドライバ
 */
export const XDriver: SNSDriver = {
  key: "x",
  authenticate: async (_denops: Denops) => Promise.resolve(),
  post: postToX,
};
