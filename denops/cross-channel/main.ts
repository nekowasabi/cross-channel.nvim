import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as buffer from "./bufferOperation.ts";
import { authenticateBluesky, authenticateMastodon } from "./auth.ts";
import {
  postToBluesky,
  postToMastodon,
  postToX,
  snsList,
  authenticators,
  posters,
  SNS,
} from "./utils.ts";
import * as n from "https://deno.land/x/denops_std@v6.5.1/function/nvim/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

/**
 * The main function that sets up the Aider plugin functionality.
 * @param {Denops} denops - The Denops instance.
 * @returns {Promise<void>}
 */
export async function main(denops: Denops): Promise<void> {
  /**
   * コマンドの引数の数を定義
   * "0"は引数なし、"1"は1つの引数、"*"は複数の引数を意味します。
   */
  type ArgCount = "0" | "1" | "*";

  /**
   * ArgCountに基づいて異なる型の関数を定義
   * "0"の場合は引数なしの関数、"1"の場合は1つの引数を取る関数、
   * "*"の場合は任意の数の引数を取る関数を意味します。
   */
  type ImplType<T extends ArgCount> = T extends "0" ? () => Promise<void>
    : T extends "1" ? (arg: string) => Promise<void>
    : (...args: string[]) => Promise<void>;

  /**
   * コマンドのオプションを定義
   * patternは引数のパターンを指定し、completeは補完の種類を指定し、
   * rangeは範囲指定が可能かどうかを示します。
   *
   * @property {string} [pattern] - 引数のパターンを指定します。
   * @property {("file" | "shellcmd")} [complete] - 補完の種類を指定します。ファイル補完またはシェルコマンド補完が可能です。
   * @property {boolean} [range] - 範囲指定が可能かどうかを示します。
   */
  type Opts<T extends ArgCount> = {
    pattern?: T extends "0" ? undefined : "[<f-args>]";
    complete?: T extends "1" ? "file" | "shellcmd" : undefined;
    range?: T extends "*" ? boolean : undefined;
  };

  /**
   * Commandは、メソッド名とその実装を含むコマンドオブジェクトを定義します。
   * @property {string} methodName - Denopsディスパッチャーで使用されるメソッド名
   * @property {ImplType<ArgCount>} impl - コマンドの実装関数
   */
  type Command = {
    methodName: string;
    impl: ImplType<ArgCount>;
  };

  /**
   * Denopsディスパッチャー用のコマンドと`command!`宣言を生成します。
   *
   * @param {string} dispatcherMethod - ディスパッチャーで使用されるメソッド名。Vim側に見えるコマンド名は Aider + DispatcherMethod のようになります。
   * @param {ImplType} impl - コマンドの実装関数。
   * @param {Opts} opts - オプション。フィールドはargCountによって変わるので型を参照。
   * @returns {Promise<Command>} - メソッド名、`command!`宣言、実装を含むコマンドオブジェクト。
   */
  async function command<argCount extends ArgCount>(
    dispatcherMethod: string,
    argCount: argCount,
    impl: ImplType<argCount>,
    opts: Opts<argCount> = {} as Opts<argCount>,
  ): Promise<Command> {
    const rangePart = opts.range ? "-range" : "";

    const commandName = `CrossChannel${
      dispatcherMethod.charAt(0).toUpperCase()
    }${dispatcherMethod.slice(1)}`;
    const completePart = opts.complete ? `-complete=${opts.complete}` : "";
    const patternPart = opts.pattern ??
      (argCount === "*" ? "[<f-args>]" : "[]");

    await denops.cmd(
      `command! -nargs=${argCount} ${completePart} ${rangePart} ${commandName} call denops#notify("${denops.name}", "${dispatcherMethod}", ${patternPart})`,
    );
    return {
      methodName: dispatcherMethod,
      impl: impl,
    };
  }

  const commands: Command[] = [
    await command("post", "0", async () => {
      const bufnr = ensure(
        await n.nvim_create_buf(denops, false, true),
        is.Number,
      );
      await buffer.openFloatingWindow(denops, bufnr, snsList.join(", "));
    }),
    // <CR>押下時の投稿処理
    await command("postFloating", "0", async () => {
      const bufnr = ensure(await n.nvim_get_current_buf(denops), is.Number);
      // バッファ内容取得
      const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];
      const message = lines.join("\n");
      // 各SNSで認証・投稿
      for (const sns of snsList) {
        const auth = authenticators[sns];
        if (auth) {
          try { await auth(denops); } catch (e) { await denops.cmd(`echom "${e.message}"`); continue; }
        }
        try {
          await posters[sns](denops, message);
        } catch (e) {
          await denops.cmd(`echom "${e.message}"`);
        }
      }
      // ウィンドウを閉じる
      await denops.cmd(`bdelete! ${bufnr}`);
    }),
    /**
     * テストコマンドを実行する
     * @async
     * @function
     * @param {string} cmd - 実行するテストコマンド
     * @description
     * 1. 指定されたテストコマンドをAiderに送信
     * 2. シェルコマンドの補完をサポート
     */
    await command(
      "test",
      "0",
      async () => {
        await authenticateMastodon(denops);
      },
    ),
    /**
     * CrossChannelSetup: 各SNSの初回認証を行うコマンド
     *
     * @async
     * @param {string} sns - SNSの名前
     */
    await command(
      "setup",
      "1",
      async (sns: string) => {
        const key = sns as SNS;
        const auth = authenticators[key] ?? (_ => denops.cmd(`echo "Unknown SNS: ${sns}"`));
        await auth(denops);
      },
      { pattern: "[<f-args>]" },
    ),
    // SNS選択投稿コマンド: 引数で指定したSNSに投稿する
    await command(
      "postSelect",
      "*",
      async (...sns: string[]) => {
        const bufnr = ensure(
          await n.nvim_create_buf(denops, false, true),
          is.Number,
        );
        await buffer.openFloatingWindow(denops, bufnr, sns.join(", "));
        // <CR> で postSelectExec を呼び出し
        await denops.cmd(
          `nnoremap <buffer> <CR> <cmd>call denops#notify("${denops.name}", "postSelectExec", ${
            JSON.stringify(sns)
          })<CR>`,
        );
      },
      { pattern: "[<f-args>]" },
    ),
    // SNS投稿実行コマンド: postSelect で指定された SNS に投稿
    await command(
      "postSelectExec",
      "*",
      async (...sns: string[]) => {
        const bufnr = ensure(await n.nvim_get_current_buf(denops), is.Number);
        const lines = await denops.call("getbufline", bufnr, 1, "$") as string[];
        const message = lines.join("\n");
        for (const s of sns) {
          const key = s as SNS;
          const auth = authenticators[key];
          if (auth) { try { await auth(denops); } catch (e) { await denops.cmd(`echom "${e.message}"`); continue; } }
          const poster = posters[key];
          if (!poster) {
            await denops.cmd(`echom "Unknown SNS: ${s}"`);
            continue;
          }
          try {
            await poster(denops, message);
          } catch (e) {
            await denops.cmd(`echom "${e.message}"`);
          }
        }
        await denops.cmd(`bdelete! ${bufnr}`);
      },
      { pattern: "[<f-args>]" },
    ),
  ];

  denops.dispatcher = Object.fromEntries(
    commands.map((
      command,
    ) => [
      command.methodName,
      command.impl as (args: unknown) => Promise<void>,
    ]),
  );
}
