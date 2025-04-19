/// <reference lib="deno.ns" />
declare const Deno: any;
import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as v from "https://deno.land/x/denops_std@v6.5.1/variable/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

// Base config directory for session files
const CONFIG_DIR = (() => {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME environment variable is not set");
  return `${home}/.config/cross-channel`;
})();

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
      .map(([k, v]) => `${percentEncode(k)}=\"${percentEncode(v)}\"`)
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
    await denops.cmd(
      `echom "X.com認証エラー: OAuth2 Application-Onlyはこのエンドポイントで使用不可。OAuth1.0aユーザーコンテキストまたはOAuth2ユーザーコンテキストのトークンに切り替えてください。詳細: https://developer.x.com/en/support/x-api/error-troubleshooting#unsupported-authentication"`,
    );
  } else if (
    Array.isArray((json as any).errors) && (json as any).errors[0]?.code === 453
  ) {
    await denops.cmd(
      `echom "X.com投稿失敗: アクセス権限不足 (code 453)。Elevated Accessが必要です: https://developer.x.com/en/portal/product"`,
    );
  }
}
