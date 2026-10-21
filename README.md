# 占い処 六根清浄

公式サイト https://uranai-rokkon.com/ の公開ファイルです。GitHub Pages（`main` ブランチ / ルート）で配信します。

静的サイト（HTML + CSS + Vanilla JS）です。ビルドは不要です。

## ローカル確認

```bash
python3 -m http.server 8000
```

## ブログ更新

Note（https://note.com/rokkon_uranai）の RSS を、GitHub Actions（`.github/workflows/update-blog.yml`）が毎時取得し、`blog/`・`blog.html`・`sitemap.xml` を更新します。

同じ処理をローカルで試す場合:

```bash
npm ci
node scripts/update_blog.js
```
