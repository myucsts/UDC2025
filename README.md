# UDC2025

埼玉県が公開している AED 設置施設データを可視化するシングルページアプリです。

## 使い方

1. 依存関係は不要です。任意の静的サーバーでルートディレクトリを配信してください。
   ```bash
   # 例：Python の簡易サーバーを使う場合
   python -m http.server 8000
   ```
2. ブラウザで `http://localhost:8000` を開きます。
3. 左側のフィルターと検索を使って市区町村ごとの AED 配置状況を確認できます。

## データソース

- 埼玉県 AED 設置施設（ArcGIS Hub, item id: `63cb7f3658e34b46b70e65d47d606f10`）
- オープンデータポータル: https://opendata.pref.saitama.lg.jp/

`data/aed.geojson` に取得済みデータを格納しています。最新情報へ差し替える場合は同じパスへ GeoJSON を配置してください。
