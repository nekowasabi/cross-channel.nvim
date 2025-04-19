/// <reference lib="deno.ns" />
declare const Deno: any;

import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as n from "https://deno.land/x/denops_std@v6.5.1/function/nvim/mod.ts";
import * as v from "https://deno.land/x/denops_std@v6.5.1/variable/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

// Base config directory for session files
const CONFIG_DIR = (() => {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME environment variable is not set");
  return `${home}/.config/cross-channel`;
})();

// SNS registry
export const snsList = ["bluesky", "mastodon", "x"] as const;
export type SNS = typeof snsList[number];
// SNSごとの認証関数マップ
import { authenticateBluesky, authenticateMastodon } from "./auth.ts";
export const authenticators: Record<SNS, (denops: Denops) => Promise<void>> = {
  bluesky: authenticateBluesky,
  mastodon: authenticateMastodon,
  x: async (_denops: Denops) => Promise.resolve(),
};
// SNSごとの投稿関数マップ
import { postToBluesky, postToMastodon, postToX } from "./post.ts";
export const posters: Record<SNS, (denops: Denops, text: string) => Promise<void>> = {
  bluesky: postToBluesky,
  mastodon: postToMastodon,
  x: postToX,
};

export { postToBluesky, postToMastodon, postToX } from "./post.ts";

/**
 * postSelectExec dispatcher function: 引数で指定されたSNSに複数投稿
 * @param {Denops} denops - Denops instance
 * @param {...string} sns - 投稿先のSNS名のリスト
 */
export async function postSelectExec(
  denops: Denops,
  ...sns: string[]
): Promise<void> {
  const bufnr = ensure(await n.nvim_get_current_buf(denops), is.Number);
  await n.nvim_buf_delete(denops, bufnr, {});

  const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];
  const prompt = lines.join("\n");
  for (const s of sns) {
    switch (s.toLowerCase()) {
      case "bluesky":
        await postToBluesky(denops, prompt);
        break;
      case "mastodon":
        await postToMastodon(denops, prompt);
        break;
      case "twitter":
      case "x":
        await postToX(denops, prompt);
        break;
      default:
        await denops.cmd(`echom "Unknown SNS: ${s}"`);
    }
  }
}
