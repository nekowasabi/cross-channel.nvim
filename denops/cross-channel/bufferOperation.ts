import * as n from "https://deno.land/x/denops_std@v6.5.1/function/nvim/mod.ts";
import type { Denops } from "https://deno.land/x/denops_std@v6.5.1/mod.ts";
import * as v from "https://deno.land/x/denops_std@v6.5.1/variable/mod.ts";
import {
  ensure,
  is,
  maybe,
} from "https://deno.land/x/unknownutil@v3.18.1/mod.ts";

/**
 * Enum representing different buffer layout options.
 */
export const bufferLayouts = ["split", "vsplit", "floating"] as const;
export type BufferLayout = (typeof bufferLayouts)[number];

/**
 * Opens a floating window for the specified buffer.
 * The floating window is positioned at the center of the terminal.
 *
 * @param {Denops} denops - The Denops instance.
 * @param {number} bufnr - The buffer number.
 * @param {string} title - The title of the floating window.
 * @returns {Promise<void>}
 */
export async function openFloatingWindow(
  denops: Denops,
  bufnr: number,
  title: string = "",
): Promise<void> {
  const terminal_width = Math.floor(
    ensure(await n.nvim_get_option(denops, "columns"), is.Number),
  );
  const terminal_height = Math.floor(
    ensure(await n.nvim_get_option(denops, "lines"), is.Number),
  );
  const floatWinHeight =
    maybe(await v.g.get(denops, "crosschannel_floatwin_height"), is.Number) ||
    20;
  const floatWinWidth =
    maybe(await v.g.get(denops, "crosschannel_floatwin_width"), is.Number) ||
    100;
  const floatWinStyle = maybe(
    await v.g.get(denops, "crosschannel_floatwin_style"),
    is.LiteralOf("minimal"),
  );

  const basicBorderOpt = [
    "single",
    "double",
    "rounded",
    "solid",
    "shadow",
    "none",
  ] as const;
  const tupleBorderOpt = is.UnionOf(
    [
      is.TupleOf([
        is.String,
        is.String,
        is.String,
        is.String,
        is.String,
        is.String,
        is.String,
        is.String,
      ]),
      is.TupleOf([
        is.String,
        is.String,
        is.String,
        is.String,
      ]),
      is.TupleOf([is.String, is.String]),
      is.TupleOf([is.String]),
    ],
  );

  const floatWinBorder = maybe(
    await v.g.get(denops, "crosschannel_floatwin_border"),
    is.UnionOf([is.LiteralOneOf(basicBorderOpt), tupleBorderOpt]),
  ) || "double";

  const floatWinBlend =
    maybe(await v.g.get(denops, "crosschannel_floatwin_blend"), is.Number) || 0;

  const row = Math.floor((terminal_height - floatWinHeight) / 2);
  const col = Math.floor((terminal_width - floatWinWidth) / 2);

  const optsWithoutStyle = {
    relative: "editor" as const,
    border: floatWinBorder,
    width: floatWinWidth,
    height: floatWinHeight,
    row: row,
    col: col,
    title: title,
    title_pos: "center" as const,
  };
  const opts:
    | typeof optsWithoutStyle
    | (typeof optsWithoutStyle & { style: "minimal" }) =
      floatWinStyle === "minimal"
        ? { ...optsWithoutStyle, style: "minimal" }
        : optsWithoutStyle;

  const winid = await n.nvim_open_win(denops, bufnr, true, opts);

  // ウィンドウの透明度を設定
  await n.nvim_win_set_option(denops, winid, "winblend", floatWinBlend);

  // ターミナルの背景色を引き継ぐための設定
  await n.nvim_win_set_option(
    denops,
    winid,
    "winhighlight",
    "Normal:Normal,NormalFloat:Normal,FloatBorder:Normal",
  );

  await denops.cmd("set nonumber");
  // Map <CR> in floating window to post via Denops dispatcher
  await denops.cmd(
    `nnoremap <buffer> <CR> <cmd>call denops#notify("${denops.name}", "postFloating", [])<CR>`,
  );
  // normal modeで q を押すとウィンドウを閉じる
  await denops.cmd(`nnoremap <buffer> q <cmd>close<CR>`);

  // 仮想テキストで操作方法を表示
  const ns = await n.nvim_create_namespace(denops, 'crosschannel');
  await n.nvim_buf_set_extmark(denops, bufnr, ns, 0, 0, {
    virt_text: [["<CR> to post", "Comment"], [" q to close", "Comment"]],
    virt_text_pos: 'eol',
  });
  // Insertモードに入ったら操作案内を消す
  await denops.cmd(
    `autocmd InsertEnter <buffer> lua vim.api.nvim_buf_clear_namespace(${bufnr}, ${ns}, 0, -1)`,
  );
  // Normalモードに戻ったら操作案内を再表示
  await denops.cmd(
    `autocmd InsertLeave <buffer> lua vim.api.nvim_buf_set_extmark(${bufnr}, ${ns}, 0, 0, { virt_text = { {"<CR> to post","Comment"}, {" q to close","Comment"} }, virt_text_pos = "eol" })`,
  );
}
