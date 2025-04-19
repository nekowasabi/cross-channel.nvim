import { assertEquals, assert } from "https://deno.land/std@0.115.1/testing/asserts.ts";
import { postToBluesky } from "../utils.ts";

// Fake Denops interface
class FakeDenops {
  public cmds: string[] = [];
  async cmd(cmd: string): Promise<void> {
    this.cmds.push(cmd);
  }
}

deno.test("postToBluesky: 正常にリクエストを送信し、成功メッセージを表示する", async () => {
  const fakeDenops = new FakeDenops();
  // 環境をスタブ
  const fakeHome = "/home/user";
  const fakeSession = { did: "did:example", accessJwt: "token123" };
  // Deno.env.get をスタブ
  (Deno.env.get as any) = (_key: string) => fakeHome;
  // Deno.readTextFile をスタブ
  (Deno.readTextFile as any) = async (_path: string) => JSON.stringify(fakeSession);
  // fetch をスタブ
  const calls: any[] = [];
  (globalThis as any).fetch = async (url: string, options: any) => {
    calls.push({ url, options });
    return { json: async () => ({}) };
  };

  const text = "Hello\nWorld";
  await postToBluesky(fakeDenops as any, text);

  // fetch が呼ばれている
  assert(calls.length === 1, "fetch should be called once");
  assertEquals(calls[0].url, "https://bsky.social/xrpc/com.atproto.repo.createRecord");
  const opts = calls[0].options;
  assertEquals(opts.method, "POST");
  assertEquals(opts.headers["Authorization"], `Bearer ${fakeSession.accessJwt}`);
  const body = JSON.parse(opts.body);
  assertEquals(body.repo, fakeSession.did);
  assert(body.record.text.includes("Hello\\nWorld"));

  // 成功メッセージが denops.cmd で送信されている
  assertEquals(fakeDenops.cmds.includes("echom \"Post succeeded\""), true);
});
