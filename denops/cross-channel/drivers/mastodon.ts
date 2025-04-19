import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import type { SNSDriver } from "../driver.ts";
import { authenticateMastodon } from "../auth.ts";
import { postToMastodon } from "../post.ts";

/**
 * Mastodon用ドライバ
 */
export const MastodonDriver: SNSDriver = {
  key: "mastodon",
  authenticate: authenticateMastodon,
  post: postToMastodon,
};
