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

import type { SNSDriver } from "./driver.ts";
import { BlueskyDriver } from "./drivers/bluesky.ts";
import { MastodonDriver } from "./drivers/mastodon.ts";
import { XDriver } from "./drivers/x.ts";

export const drivers: Record<SNS, SNSDriver> = {
  bluesky: BlueskyDriver,
  mastodon: MastodonDriver,
  x: XDriver,
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
    const key = s.toLowerCase() as SNS;
    const driver = drivers[key];
    if (!driver) {
      await denops.cmd(`echom "Unknown SNS: ${s}"`);
      continue;
    }
    try {
      await driver.authenticate(denops);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await denops.cmd(`echom "${msg}"`);
      continue;
    }
    try {
      await driver.post(denops, prompt);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await denops.cmd(`echom "${msg}"`);
    }
  }
}
