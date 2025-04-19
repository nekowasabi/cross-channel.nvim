/// <reference lib="deno.ns" />
declare const Deno: any;

import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as v from "https://deno.land/x/denops_std@v6.5.1/variable/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

// Base config directory for session files
export const CONFIG_DIR = (() => {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME environment variable is not set");
  return `${home}/.config/cross-channel`;
})();

/**
 * Authenticate with Bluesky.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>} A promise that resolves when authentication is complete.
 */
export async function authenticateBluesky(denops: Denops): Promise<void> {
  const id = ensure(
    await v.g.get(denops, "crosschannel_bluesky_id"),
    is.String,
  );
  const pass = ensure(
    await v.g.get(denops, "crosschannel_bluesky_password"),
    is.String,
  );
  const sessionUrl =
    "https://bsky.social/xrpc/com.atproto.server.createSession";

  const res = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: id, password: pass }),
  });
  if (!res.ok) {
    throw new Error(`Bluesky認証に失敗しました: ${res.statusText}`);
  }
  const session = await res.json();
  // セッション情報をファイルに保存
  await Deno.mkdir(CONFIG_DIR, { recursive: true });
  const file = `${CONFIG_DIR}/bluesky_session.json`;
  await Deno.writeTextFile(file, JSON.stringify(session, null, 2));
}

/**
 * Authenticate with Mastodon.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>} A promise that resolves when authentication is complete.
 */
export async function authenticateMastodon(denops: Denops): Promise<void> {
  const host = ensure(
    await v.g.get(denops, "crosschannel_mastodon_host"),
    is.String,
  );
  const token = ensure(
    await v.g.get(denops, "crosschannel_mastodon_token"),
    is.String,
  );
  // トークン検証
  const url = `https://${host}/api/v1/accounts/verify_credentials`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(`Mastodon認証に失敗しました: ${body}`);
  }
}
