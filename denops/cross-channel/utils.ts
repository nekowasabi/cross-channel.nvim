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
  const file = `${CONFIG_DIR}/bluesky_session.json`;
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
    await denops.cmd('echom "Post succeeded"');
  }
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
  // セッション保存
  await Deno.mkdir(CONFIG_DIR, { recursive: true });
  const file = `${CONFIG_DIR}/mastodon_session.json`;
  await Deno.writeTextFile(
    file,
    JSON.stringify({ host, accessToken: token }, null, 2),
  );
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
  const file = `${CONFIG_DIR}/mastodon_session.json`;
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
    await denops.cmd(`echom "Mastodonプログラム成功"`);
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
  const consumerKey = ensure(
    await v.g.get(denops, "crosschannel_x_consumer_key"),
    is.String,
  );
  const consumerSecret = ensure(
    await v.g.get(denops, "crosschannel_x_consumer_secret"),
    is.String,
  );
  const accessToken = ensure(
    await v.g.get(denops, "crosschannel_x_access_token"),
    is.String,
  );
  const accessTokenSecret = ensure(
    await v.g.get(denops, "crosschannel_x_access_token_secret"),
    is.String,
  );
  const oauth_nonce = Array.from(
    { length: 32 },
    () => Math.floor(Math.random() * 36).toString(36),
  ).join("");
  const oauth_timestamp = Math.floor(Date.now() / 1000).toString();
  const url = "https://api.twitter.com/2/tweets";
  const percentEncode = (s: string) =>
    encodeURIComponent(s).replace(
      /[!*'()]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
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
  const baseString = ["POST", percentEncode(url), percentEncode(sortedParams)]
    .join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${
    percentEncode(accessTokenSecret)
  }`;
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
  const oauth_signature = btoa(
    String.fromCharCode(...new Uint8Array(signatureData)),
  );
  oauthParams.oauth_signature = oauth_signature;
  const authHeader = "OAuth " +
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
  if (
    json.status === 403 &&
    json.type ===
      "https://api.twitter.com/2/problems/unsupported-authentication"
  ) {
    // Unsupported Authentication: OAuth2 Application-Onlyは使えません
    await denops.cmd(
      `echom "X.com認証エラー: OAuth2 Application-Onlyはこのエンドポイントで使用不可。OAuth1.0aユーザーコンテキストまたはOAuth2ユーザーコンテキストのトークンに切り替えてください。詳細: https://developer.x.com/en/support/x-api/error-troubleshooting#unsupported-authentication"`,
    );
  } else if (
    Array.isArray((json as any).errors) && (json as any).errors[0]?.code === 453
  ) {
    // アクセス権限不足 (code 453)
    await denops.cmd(
      `echom "X.com投稿失敗: アクセス権限不足 (code 453)。Elevated Accessが必要です: https://developer.x.com/en/portal/product"`,
    );
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
