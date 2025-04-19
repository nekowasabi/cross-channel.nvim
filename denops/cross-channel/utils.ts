/// <reference lib="deno.ns" />
declare const Deno: any;

import * as fn from "https://deno.land/x/denops_std@v6.5.1/function/mod.ts";
import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as v from "https://deno.land/x/denops_std@v6.5.1/variable/mod.ts";
import {
  ensure,
  is,
  maybe,
} from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

/**
 * Gets the additional prompt from vim global variable
 *
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<string[] | undefined>} A promise that resolves to an array of additional prompts, or undefined if no prompts are found.
 */
export async function getPromptFromVimVariable(
  denops: Denops,
  variableName: string,
): Promise<string[] | undefined> {
  const prompts = maybe(
    await v.g.get(denops, variableName),
    is.ArrayOf(is.String),
  );
  return Array.isArray(prompts) ? prompts : undefined;
}

/**
 * Gets the current file path.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<string>} A promise that resolves to the current file path.
 */
export async function getCurrentFilePath(denops: Denops): Promise<string> {
  const path = await fn.expand(denops, "%:p");
  return ensure(path, is.String);
}

/**
 * Gets the buffer name for a given buffer number.
 * @param {Denops} denops - The Denops instance.
 * @param {number} bufnr - The buffer number.
 * @returns {Promise<string>} A promise that resolves to the buffer name.
 * @throws {Error} Throws an error if the buffer name is not a string.
 */
export async function getBufferName(
  denops: Denops,
  bufnr: number,
): Promise<string> {
  const bufname = await fn.bufname(denops, bufnr);
  return ensure(bufname, is.String);
}

/**
 * Authenticate with Bluesky.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>} A promise that resolves when authentication is complete.
 */
export async function authenticateBluesky(denops: Denops): Promise<void> {
  // Bluesky認証処理
  // Vimグローバル変数からIDとパスワードを取得
  const id = ensure(
    await v.g.get(denops, "crosschannel_bluesky_id"),
    is.String,
  );
  const pass = ensure(
    await v.g.get(denops, "crosschannel_bluesky_password"),
    is.String,
  );
  // セッション取得API
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
  const home = Deno.env.get("HOME")!;
  const dir = `${home}/.config/cross-channel`;
  await Deno.mkdir(dir, { recursive: true });
  const file = `${dir}/bluesky_session.json`;
  await Deno.writeTextFile(file, JSON.stringify(session, null, 2));
  // 完了メッセージ
  await denops.cmd(`echom "Bluesky認証が完了しました (${file})"`);
}

/**
 * Posts text content to Bluesky using saved session.
 * @param {Denops} denops - The Denops instance.
 * @param {string} text - The content to post.
 */
export async function postToBluesky(
  denops: Denops,
  text: string,
): Promise<void> {
  if (!text) {
    return;
  }
  const home = Deno.env.get("HOME")!;
  const file = `${home}/.config/cross-channel/bluesky_session.json`;
  const session = JSON.parse(await Deno.readTextFile(file));
  const content = text.replaceAll("\n", "\\n");
  const body = {
    repo: session.did,
    collection: "app.bsky.feed.post",
    record: {
      text: content,
      createdAt: new Date().toISOString(),
      langs: ["ja"],
    },
  };
  const res = await fetch(
    "https://bsky.social/xrpc/com.atproto.repo.createRecord",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (json.error != null) {
    await denops.cmd(`echom "Post failed: ${json.error} : ${json.message}"`);
  } else {
    await denops.cmd("echom \"Post succeeded\"");
  }
}

/**
 * Authenticate with Mastodon.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>} A promise that resolves when authentication is complete.
 */
export async function authenticateMastodon(denops: Denops): Promise<void> {
  const host = ensure(await v.g.get(denops, "crosschannel_mastodon_host"), is.String);
  const token = ensure(await v.g.get(denops, "crosschannel_mastodon_token"), is.String);
  // トークン検証
  const url = `https://${host}/api/v1/accounts/verify_credentials`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (res.status !== 200) {
    throw new Error(`Mastodon認証に失敗しました: ${body}`);
  }
  // セッション保存
  const home = Deno.env.get("HOME")!;
  const dir = `${home}/.config/cross-channel`;
  await Deno.mkdir(dir, { recursive: true });
  const file = `${dir}/mastodon_session.json`;
  await Deno.writeTextFile(file, JSON.stringify({ host, accessToken: token }, null, 2));
  await denops.cmd(`echom "Mastodon認証が完了しました (${file})"`);
}

/**
 * Posts text content to Mastodon using saved session.
 * @param {Denops} denops - The Denops instance.
 * @param {string} text - The content to post.
 */
export async function postToMastodon(
  denops: Denops,
  text: string,
): Promise<void> {
  if (!text) return;
  const home = Deno.env.get("HOME")!;
  const file = `${home}/.config/cross-channel/mastodon_session.json`;
  const sess = JSON.parse(await Deno.readTextFile(file));
  const res = await fetch(
    `https://${sess.host}/api/v1/statuses`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${sess.accessToken}`,
      },
      body: new URLSearchParams({ status: text }).toString(),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    await denops.cmd(`echom "Mastodon投稿失敗: ${err}"`);
  } else {
    await denops.cmd(`echom "Mastodon投稿成功"`);
  }
}

// Slack用の認証処理を追加
/**
 * Authenticate with Slack.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>} A promise that resolves when authentication is complete.
 */
export async function authenticateSlack(denops: Denops): Promise<void> {
  const token = ensure(
    await v.g.get(denops, "crosschannel_slack_token"),
    is.String,
  );
  const channel = ensure(
    await v.g.get(denops, "crosschannel_slack_channel"),
    is.String,
  );
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Slack認証に失敗しました: ${json.error}`);
  }
  const home = Deno.env.get("HOME")!;
  const dir = `${home}/.config/cross-channel`;
  await Deno.mkdir(dir, { recursive: true });
  const file = `${dir}/slack_session.json`;
  await Deno.writeTextFile(file, JSON.stringify({ token, channel }, null, 2));
  await denops.cmd(`echom "Slack認証が完了しました (${file})"`);
}

/**
 * Posts text content to Slack using saved session.
 * @param {Denops} denops - The Denops instance.
 * @param {string} text - The content to post.
 */
export async function postToSlack(
  denops: Denops,
  text: string,
): Promise<void> {
  if (!text) return;
  const home = Deno.env.get("HOME")!;
  const file = `${home}/.config/cross-channel/slack_session.json`;
  const sess: { token: string; channel: string } = JSON.parse(
    await Deno.readTextFile(file),
  );
  const body = { channel: sess.channel, text };
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    await denops.cmd(`echom "Slack投稿失敗: ${json.error}"`);
  } else {
    await denops.cmd(`echom "Slack投稿成功"`);
  }
}
