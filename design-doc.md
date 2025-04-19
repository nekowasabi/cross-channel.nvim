# Cross‑Channel.nvim 設計書

## 1. 背景・目的
- Neovim 上で書いたテキストをワークフローを止めずに複数のSNSへ同時投稿したい  
- Deno＋Denops を使った軽量プラグインとして提供

## 2. ゴール
- `:CrossPost` コマンドでバッファ内容を一度に複数SNSへ投稿  
- 各SNSごとの認証（OAuth1/2）を一元管理  
- 拡張性の高いプラグインアーキテクチャ

## 3. スコープ
- Bluesky, Mastodon, X (formerly Twitter)
- テキスト投稿のみ（画像／メディアは次フェーズ）  
- 非同期処理によるレスポンス保持

## 4. ユーザーストーリー
1. ユーザーは `:CrossChannelSetup SNSの名前` で初回認証を行う  
2. `:CrossChannelPost` を実行すると、floating windowが表示され、入力してからnormal modeで<CR>を押すと、投稿が行われる  
3. 投稿結果（成功／失敗）を コマンドラインに表示

## 5. 機能要件
- CPSetup：各SNSのクレデンシャル保存  
- CPAuth：OAuthハンドシェイク  
- CrossPost：バッファ or 選択範囲の投稿  
- CPStatus：過去の投稿履歴確認（ローカルキャッシュ）

## 6. 非機能要件
- 非同期／ノンブロッキング  
- 設定ファイル：`~/.config/cross-channel/config.toml`  
- ログレベル切替（info/debug）  
- テストカバレッジ ≥80%

## 7. アーキテクチャ
### 7.1 プラグインディレクトリ構成
- `denops/cross-channel/`: Denops プラグイン本体（`main.ts`, `bufferOperation.ts`, `utils.ts`）
- `tests/`: ユニットテスト（`utils_test.ts`, `main_test.ts` など）
- ドキュメント: `README.md`, `design-doc.md`, `.windsurfrules`

### 7.2 モジュール構成
- `main.ts`: Denops エントリポイント、コマンド登録と dispatcher 定義
- `bufferOperation.ts`: Floating window 操作、キー マッピング、仮想テキスト表示
- `utils.ts`: 各SNS (Bluesky, Mastodon, X) の認証／投稿 関数
- `tests/`: 各モジュールのユニットテスト

### 7.3 アーキテクチャ図
```text
[Neovim]─Denops → [denops/cross-channel] → [utils] → [HTTP/Fetch]
                             │
                             └→[ConfigManager]
```

### 7.4 Core Module
- `main.ts`, `bufferOperation.ts`, `utils.ts`
- 認証 (authenticateBluesky, ...)、投稿 (postToX, ...) ロジックを実装
- `config.ts`: `config.toml` 読み込みとバリデーション

### 7.5 データフロー
1. `:CrossChannelPost` (または `:postSelect`) 実行 → floating window 表示
2. ユーザーが入力後、Normal モードで `<CR>` 押下 → Denops dispatcher 呼び出し
3. `utils` の各投稿関数 (Bluesky/Mastodon/X) を順次実行
4. 結果をコマンドラインに表示し、ウィンドウを閉じる
