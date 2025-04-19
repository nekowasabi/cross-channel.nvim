import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import type { SNS } from "./utils.ts";

/**
 * SNSドライバのインターフェース定義
 */
export interface SNSDriver {
  /** SNSのキー */
  key: SNS;
  /** 認証処理 */
  authenticate(denops: Denops): Promise<void>;
  /** 投稿処理 */
  post(denops: Denops, text: string): Promise<void>;
}
