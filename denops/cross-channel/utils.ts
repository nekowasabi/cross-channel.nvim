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
  const content = text;
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

/**
 * Posts text content to x.com (formerly Twitter) using OAuth1.0a User Context.
 * @param {Denops} denops - The Denops instance.
 * @param {string} text - The content to post.
 */
export async function postToX(
  denops: Denops,
  text: string,
): Promise<void> {
  if (!text) return;
  // OAuth1.0a User Contextでステータス投稿
  const consumerKey = ensure(await v.g.get(denops, "crosschannel_x_consumer_key"), is.String);
  const consumerSecret = ensure(await v.g.get(denops, "crosschannel_x_consumer_secret"), is.String);
  const accessToken = ensure(await v.g.get(denops, "crosschannel_x_access_token"), is.String);
  const accessTokenSecret = ensure(await v.g.get(denops, "crosschannel_x_access_token_secret"), is.String);
  const oauth_nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  const oauth_timestamp = Math.floor(Date.now() / 1000).toString();
  const url = "https://api.twitter.com/2/tweets";
  const percentEncode = (s: string) =>
    encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_token: accessToken,
    oauth_nonce,
    oauth_timestamp,
    oauth_signature_method: "HMAC-SHA1",
    oauth_version: "1.0",
  };
  // OAuth1.0aではJSONボディは署名に含めないため、パラメータはoauthParamsのみ
  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");
  const baseString = ["POST", percentEncode(url), percentEncode(sortedParams)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureData = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(baseString),
  );
  const oauth_signature = btoa(String.fromCharCode(...new Uint8Array(signatureData)));
  oauthParams.oauth_signature = oauth_signature;
  const authHeader =
    "OAuth " +
    Object.entries(oauthParams)
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(", ");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ text }),
  });
  const json = await res.json();
  if (json.status === 403 && json.type === "https://api.twitter.com/2/problems/unsupported-authentication") {
    // Unsupported Authentication: OAuth2 Application-Onlyは使えません
    await denops.cmd(
      `echom "X.com認証エラー: OAuth2 Application-Onlyはこのエンドポイントで使用不可。OAuth1.0aユーザーコンテキストまたはOAuth2ユーザーコンテキストのトークンに切り替えてください。詳細: https://developer.x.com/en/support/x-api/error-troubleshooting#unsupported-authentication"`
    );
  } else if (Array.isArray((json as any).errors) && (json as any).errors[0]?.code === 453) {
    // アクセス権限不足 (code 453)
    await denops.cmd(
      `echom "X.com投稿失敗: アクセス権限不足 (code 453)。Elevated Accessが必要です: https://developer.x.com/en/portal/product"`
    );
  } else {
    // 投稿 ID を表示
    await denops.cmd(`echom "X.com投稿成功: ${json.id}"`);
  }
}

/**
 * postSelectExec dispatcher function: 引数で指定されたSNSに複数投稿
 * @param {Denops} denops - Denops instance
 * @param {...string} sns - 投稿先のSNS名のリスト
 */
export async function postSelectExec(
  denops: Denops,
  ...sns: string[]
): Promise<void> {
  const bufnr = ensure(await fn.nvim_get_current_buf(denops), is.Number);
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
      case "slack":
        await postToSlack(denops, prompt);
        break;
      case "twitter":
      case "x":
        await postToX(denops, prompt);
        break;
      default:
        await denops.cmd(`echom "Unknown SNS: ${s}"`);
    }
  }
  await fn.nvim_buf_delete(denops, bufnr, {});
}
