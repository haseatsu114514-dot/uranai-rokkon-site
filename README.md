# 占い処 六根清浄

公式サイト https://uranai-rokkon.com/ の公開ファイルです。GitHub Pages（`main` ブランチ / ルート）で配信します。

静的サイト（HTML + CSS + Vanilla JS）です。ビルドは不要です。

## ローカル確認

```bash
python3 -m http.server 8000
```

## デザインとCSSの構成

「紙と墨」を基調に、見出しは明朝（Shippori Mincho）、本文と操作まわりはゴシック（Zen Kaku Gothic New）で組んでいます。囲み罫や影は使わず、罫線と余白で情報を区切ります。

| ファイル | 役割 |
|----------|------|
| `css/style.css` | 配色・書体などの変数、ヘッダー、フッター、ボタン、下層ページの見出し（パンくず）、ページ末尾の予約導線 |
| `css/redesign.css` | 本文用の共通部品（`rk-` プレフィックス）とトップページ。段組（`rk-split`）、時系列（`rk-phases`）、比較表（`rk-compare`）、読みもの（`rk-doc`）、口コミ（`rk-ts-*`）など |
| `css/about.css` `pricing.css` `reserve.css` `faq.css` `blog.css` | そのページだけで使うスタイル |

色や余白は `css/style.css` 冒頭の `:root` の変数（`--paper` `--ink` `--rule` `--moss` など）を変えると全ページに反映されます。ヘッダーとフッターは全ページ同じマークアップです（ブログ記事ページは `scripts/update_blog.js` 内のテンプレートが出力します）。

## ブログ更新

Note（https://note.com/rokkon_uranai）の RSS を、GitHub Actions（`.github/workflows/update-blog.yml`）が毎時取得し、`blog/`・`blog.html`・`sitemap.xml` を更新します。

同じ処理をローカルで試す場合:

```bash
npm ci
node scripts/update_blog.js
```
