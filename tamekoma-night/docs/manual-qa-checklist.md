# Cadenza.fm — Manual QA Checklist

Automated E2E は大半の回帰を捕捉するが、以下は人間が実機で触らないと検出できない領域。
リリース前には必ず **Free / Premium 両ロール** で一通り実施する。項目数は意図的に絞ってあるので、
全部 15-20 分で回る想定。

## 使い方

- PR を main にマージする前に担当者が check を埋める
- 問題があれば issue 化して PR にリンクしてから進める
- 「月1」項目は曜日を固定して (月曜朝など) スプリント計画に組み込む

---

## ✅ リリース前 (必須 / 毎回)

### 1. Free ユーザー最小フロー (約 3 分)
- [ ] 新規ブラウザタブで https://cadenza.fm を開き Google ログイン (または dev mode)
- [ ] 「新規Song」ボタンで Song を作成、タイトルを入力
- [ ] ChordTimeline でコード入力 `| C | Am | F | G |`
- [ ] 新規 Section 追加 → 名前 "A" 付与
- [ ] `+ Block` で Block 追加 → BlockPopover 開く
- [ ] AI prompt「弾き語り風の優しいアレンジ」→ 生成 → Preview 再生
- [ ] **OK を押して dialog が閉じる** (structuredClone 回帰チェック)
- [ ] Space キーで全体再生、再度 Space で停止
- [ ] `Cmd/Ctrl + S` で保存 → トースト表示
- [ ] ブラウザリロード → タイトル・コード・Block が保持されている

### 2. Premium Mixer + VST/CLAP (約 5 分)
- [ ] Mixer タブを開く
- [ ] Bridge が未接続なら curtain に **Bridge を起動** ガイダンスが表示されるか確認
- [ ] Cadenza Bridge アプリを起動
- [ ] Lead トラック `+ Insert` → CLAP タブ → **Surge XT** を Add
- [ ] Chain Node に Surge XT が表示される
- [ ] PlayerBar ▶️ → **実際に音が鳴る** (ヘッドホン必須)
- [ ] MixerChat に「vocal を前に出して」→ AI 提案 → Apply できるか
- [ ] 保存 → リロード → Insert が保持される

### 3. Automation レーン (約 2 分)
- [ ] Automation タブ → Lane 追加 → Filter cutoff を選択
- [ ] AI 曲線「buildup」生成 → Preview → Apply → 保存

### 4. Modal viewport / レスポンシブ (約 2 分)
- [ ] ブラウザ幅を **1024×768** に絞る
- [ ] BlockPopover / ChordEditDialog / PluginPicker / ParamTargetPicker / HelpModal の
      **OK / Add / 閉じる** ボタンがすべて viewport 内にあってクリックできる
- [ ] iPad 縦 (Safari) で同じモーダルを開いてフリック操作

### 5. キーボードショートカット (約 1 分)
- [ ] `Cmd/Ctrl + S` → 保存トースト
- [ ] `Space` → 再生/停止 (入力欄フォーカス時は Space を入力欄に入れる)
- [ ] `Escape` → モーダル閉じる + フォーカス解除

---

## 🔁 週次 (毎週月曜)

### 6. 実機プラグイン検証 (約 5 分)
- [ ] Surge XT (CLAP) で複数パッチ切り替え、音質・latency 主観評価
- [ ] (任意) Vital / Dexed (VST3) が `~/Library/Audio/Plug-Ins/VST3/` にあれば Add → 鳴動確認
- [ ] CPU 使用率 (Activity Monitor) 30% 以下を目安

### 7. AI 生成の音楽的妥当性 (約 5 分)
- [ ] 同じコード進行で prompt を 3 パターン試し、生成結果を聴き比べ
- [ ] 「ジャズバラード」「8ビートロック」「ボサノバ」など異なるスタイル
- [ ] 明らかに音楽として破綻していない (bar 境界で不自然な跳躍がない等)

### 8. Preview 音量サプライズ防止
- [ ] 初回 Preview がヘッドホンで耳を痛めないレベル (-20 dBFS 目安) から始まるか
- [ ] ボリューム設定が前回値を覚えているか

---

## 📅 月次 (毎月1回)

### 9. ロングセッション
- [ ] 1 時間以上の連続編集で memory leak が無い (DevTools Memory タブで確認)
- [ ] 編集中タブを 30 分放置 → 戻って操作 → 状態が保持されている
- [ ] 複数 Song を往復して切替えても state 汚染 (前の曲の Block が出る等) なし

### 10. Bridge 接続切替ドリル
- [ ] Bridge 起動 → Premium でログイン → Mixer 開く → 音が出る
- [ ] Bridge を終了 → Mixer のエンジン種類が切り替わる / 適切に警告
- [ ] Bridge 再起動 → 自動再接続するか (手動リロードなしで)
- [ ] Bridge 更新バッジが premium user に表示されるか (updateAvailable=true stub)

---

## 🚨 インシデント対応 (発見時に追加)

発見済みバグと再発監視項目を下記に追記する。

- **2026-04-15**: FlowEditor.emit() が $state proxy を structuredClone して DataCloneError で OK が何も
  しない問題 → `$state.snapshot()` に修正済み (commit TBD)。以降、**BlockPopover の OK を押したら
  dialog が閉じる** を手動確認項目として必ず通す。e2e 回帰: `ui-modal-footer-invariant.spec.ts` の
  "BlockPopover OK click regression" セクション。
- **2026-04-15**: ChordEditDialog の Escape が overlay の keydown ハンドラに束縛されていて focus
  依存だった問題 → `svelte:window onkeydown` に修正済み。手動確認: **コード編集ダイアログを開いた
  ままで Escape で閉じる** を通す。

---

## メンテナンス

- このチェックリストは release branch の PR template からリンクされる (TODO: 設定)
- 項目を増やすときは時間予算 (15-20 分) を超えないよう、重複を整理する
- 自動化できる項目があれば `e2e/scenarios/ui-*` に移してここから削除する
