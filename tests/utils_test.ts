/// <reference lib="deno.ns" />
declare const Deno: any;
import { assertEquals, assert } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { postToBluesky, postToMastodon, postToX } from "../denops/cross-channel/utils.ts";

// Fake Denops interface
class FakeDenops {
  public cmds: string[] = [];
  async cmd(cmd: string): Promise<void> {
    this.cmds.push(cmd);
  }
}

// テスト関数名と実行
Deno.test("postToBluesky: 正常にリクエストを送信し、成功メッセージを表示する", async () => {
  const fakeDenops = new FakeDenops();
  // 環境をスタブ
  const fakeHome = "/home/user";
  const fakeSession = { did: "did:example", accessJwt: "token123" };
  // Deno.env.get をスタブ
  (Deno.env.get as any) = (_key: string) => fakeHome;
  // Deno.readTextFile をスタブ
  (Deno.readTextFile as any) = async (_path: string) => JSON.stringify(fakeSession);
  // fetch をスタブ (RequestInfo/RequestInitを使用)
  type FetchCall = { url: string; options: RequestInit };
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, options: init! });
    return { json: async () => ({}), ok: true } as Response;
  }) as typeof fetch;

  const text = "Hello\nWorld";
  await postToBluesky(fakeDenops as any, text);

  // fetch が呼ばれている
  assert(calls.length === 1, "fetch should be called once");
  assertEquals(calls[0].url, "https://bsky.social/xrpc/com.atproto.repo.createRecord");
  const opts = calls[0].options;
  assertEquals(opts.method, "POST");
  const headers = opts.headers as Record<string, string>;
  assertEquals(headers["Authorization"], `Bearer ${fakeSession.accessJwt}`);
  const body = JSON.parse(opts.body as string);
  assertEquals(body.repo, fakeSession.did);
  assertEquals(body.record.text, text);

  // 成功メッセージが denops.cmd で送信されている
  assertEquals(fakeDenops.cmds[0], "echom \"Post succeeded\"");
});

// Mastodon投稿のユニットテスト
Deno.test("postToMastodon: 正常にリクエストを送信し、成功メッセージを表示する", async () => {
  const fakeDenops = new FakeDenops();
  const fakeHome = "/home/user";
  const fakeSession = { host: "example.com", accessToken: "token123" };
  // 環境をスタブ
  (Deno.env.get as any) = (_: string) => fakeHome;
  // セッションファイル読み取りをスタブ
  (Deno.readTextFile as any) = async (_: string) => JSON.stringify(fakeSession);
  // fetch をスタブ (any を排除)
  type FetchCall = { url: string; options: RequestInit };
  const calls: FetchCall[] = [];
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, options: init! });
    return { text: async () => "", ok: true } as Response;
  };

  const text = "Hello Mastodon";
  await postToMastodon(fakeDenops as any, text);

  // fetch が呼ばれている
  assert(calls.length === 1, "fetch should be called once");
  assertEquals(calls[0].url, `https://${fakeSession.host}/api/v1/statuses`);
  const opts = calls[0].options;
  assertEquals(opts.method, "POST");
  const headers = opts.headers as Record<string, string>;
  assertEquals(headers["Authorization"], `Bearer ${fakeSession.accessToken}`);
  assertEquals(headers["Content-Type"], "application/x-www-form-urlencoded");
  // URLSearchParams で空白は + にエンコードされる
  assertEquals(opts.body, "status=Hello+Mastodon");

  // 成功メッセージが denops.cmd で送信されている
  assertEquals(fakeDenops.cmds[0], "echom \"Mastodon\u30d7\u30ed\u30b0\u30e9\u30e0\u6210\u529f\"");
});
