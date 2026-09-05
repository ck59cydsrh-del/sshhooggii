# sshhooggii

将棋の「持ち駒」をラン全体に拡張したローグライク。
取った駒は次の階へ持って行け、階ごとに能力をひとつ選ぶ。

**あそぶ** → https://ck59cydsrh-del.github.io/sshhooggii/

## モード

- **潜る** — 階層を降りて駒と能力を集める。玉を取られたらすべて失う
- **対戦** — 駒10枚と能力を組んで2本先取
  - 同じWi-Fi … `serve.py` を起動した端末どうし
  - インターネット … ブラウザ同士を直結(GitHub Pages でもそのまま動く)

## 手元で動かす

```bash
python3 serve.py 8903
```

静的配信と、同じWi-Fi内の対戦を中継する。表示されるURLをスマホで開けば遊べる。
`python3 -m http.server` でも遊べるが、その場合「同じWi-Fi」対戦は使えない。

## 素材

- BGM `bgm/loop.webm`、効果音 `sfx/*.wav` — 自作
- 書体 `font/shippori-*.woff2` — Shippori Mincho (SIL Open Font License 1.1) を使用文字だけに絞って同梱
