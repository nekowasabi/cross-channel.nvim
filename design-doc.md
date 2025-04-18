# Cross‑Channel.nvim 設計書

## 1. 背景・目的
- Neovim 上で書いたテキストをワークフローを止めずに複数のSNSへ同時投稿したい  
- Deno＋Denops を使った軽量プラグインとして提供

## 2. ゴール
- `:CrossPost` コマンドでバッファ内容を一度に複数SNSへ投稿  
- 各SNSごとの認証（OAuth1/2）を一元管理  
- 拡張性の高いプラグインアーキテクチャ

## 3. スコープ
- Twitter, Mastodon, Slack
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
- `./adapters/` ディレクトリ配下に各SNSごとのモジュールを置く  
  - 例：`adapters/twitter.ts`、`adapters/mastodon.ts`、`adapters/slack.ts` など  
- `./denops/`：Denops プラグインのエントリポイント（`denops/cross-channel/...`）  
- `./tests/`：ユニットおよび統合テスト配置（`tests/adapters/`, `tests/core/`, `tests/denops/`）  

### 7.2 抽象インタフェース（SNSAdapter）
```ts
export interface SNSAdapter {
  /** プラグイン名（設定ファイルのキーと一致） */
  name: string;
  /** 初期化／認証済みかチェック */
  init(config: Config): Promise<void>;
  /** 投稿実行 */
  post(content: string): Promise<PostResult>;
  /** 認証フロー開始（CPAuth 呼び出し時に利用） */
  authenticate(): Promise<void>;
} 

### 7.3 アーキテクチャ図
```text
[Neovim]─Denops→[PluginLoader]→[AdapterRegistry]→[SNSAdapter*]→[HTTP/Fetch]
                             │
                             └→[ConfigManager]
```

### 7.4 プラグインローダー
- 起動時に `Deno.readDir("./adapters")` でモジュール検出
- `await import()` で動的ロード
- `module.default` を `AdapterRegistry` に登録

### 7.5 AdapterRegistry
```ts
class AdapterRegistry {
  private adapters = new Map<string, SNSAdapter>();
  register(adapter: SNSAdapter) {
    this.adapters.set(adapter.name, adapter);
  }
  list(): SNSAdapter[] {
    return [...this.adapters.values()];
  }
}
```

### 7.6 Core Module
- `main.ts`: Denops エントリポイント、コマンド登録
- `pluginLoader.ts`: adapters ディレクトリ走査と動的ロード
- `adapterRegistry.ts`: 登録済 Adapter 管理
- `postManager.ts`: 投稿ワークフロー制御
- `config.ts`: `config.toml` 読み込みとバリデーション

### 7.7 データフロー
1. `:CrossPost` 実行 → floating window で入力
2. `postManager` が入力内容を取得
3. `AdapterRegistry.list()` の各 `post()` を並列実行
4. 結果を集約 → コマンドラインに表示

