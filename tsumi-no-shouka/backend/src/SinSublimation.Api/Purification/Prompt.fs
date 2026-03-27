namespace SinSublimation.Api.Purification

module Prompt =

    let private themes = [|
        // Data & Parsing
        "CSVパーサー"; "JSONパース＆変換"; "XMLコンフィグ読み込み"; "ログファイル集計"
        // Web & API
        "HTTPリクエストリトライ"; "REST APIクライアント"; "Webhookディスパッチャー"; "URLルーター"
        // Business Logic
        "ショッピングカート計算"; "税額計算エンジン"; "割引クーポン適用"; "在庫管理"; "請求書生成"; "給与計算"
        // Auth & Security
        "ユーザー登録バリデーション"; "権限チェック (RBAC)"; "パスワード強度判定"; "セッション管理"
        // File & I/O
        "ファイル一括リネーム"; "画像リサイズバッチ"; "ZIPアーカイブ作成"
        // Algorithm
        "素数判定"; "ソートアルゴリズム"; "最短経路探索"; "単語頻度カウント"; "レーベンシュタイン距離"
        // Infrastructure
        "データベース接続プール"; "キャッシュ管理 (LRU)"; "メール送信リトライ"; "フィーチャーフラグ管理"
        // Date/Format
        "日付フォーマット変換"; "タイムゾーン変換"; "メールアドレス検証"
        // Game/Fun
        "FizzBuzz"; "じゃんけんゲーム"; "数当てゲーム"; "迷路生成"; "TODOリスト管理"
    |]

    let private languages = [|
        "Java"; "Python"; "COBOL"; "C++"; "PHP"; "Ruby"; "JavaScript"
    |]

    let private sinCategories = [|
        "null地獄（null返却・NullPointerExceptionの温床）"
        "ボイラープレート地獄（getter/setter・冗長クラス定義）"
        "副作用の混入（printlnデバッグ・グローバル状態変更）"
        "ミュータブル変数の乱用（var祭り・破壊的更新）"
        "例外握り潰し（空のcatch・エラーの闇葬送）"
        "マジックナンバー（意味不明な42・URL直書き）"
        "深いネスト地獄（if-else 8段・コールバック地獄）"
        "型安全性の放棄（Object型・キャスト祭り）"
        "コピペプログラミング（同じコード3回貼り付け）"
        "文字列駆動開発（文字列でif分岐・SQL組み立て）"
        "God Object（1クラスに全責任・3000行ユーティリティ）"
        "過剰な抽象化（AbstractSingletonProxyFactoryBean）"
    |]

    let private fsharpFeatures = [|
        "パイプライン演算子(|>)による流れるような変換"
        "判別共用体(DU)による型安全な状態表現"
        "Option型によるnull撲滅"
        "パターンマッチによる網羅的分岐"
        "不変データ構造とレコード型"
        "Computation Expression"
        "アクティブパターンによる宣言的分解"
        "部分適用とカリー化"
        "Seq/List/Arrayの高階関数チェーン"
        "型推論による簡潔さと型安全性の両立"
    |]

    let private rng = System.Random.Shared
    let private pick (arr: 'a array) = arr[rng.Next(arr.Length)]

    let buildMessages () =
        let theme = pick themes
        let lang = pick languages
        let sin = pick sinCategories
        let feature = pick fsharpFeatures
        let intensity = pick [| "地獄級"; "大罪級"; "煉獄級"; "魔王級"; "災厄級" |]

        let content =
            $"今回のテーマ: 「{theme}」\n"
            + $"使用言語: {lang}\n"
            + $"主要な罪: {sin}\n"
            + $"罪の強度: {intensity}\n"
            + $"F#版では特に「{feature}」を活かせ。\n"
            + "この組み合わせで、現実のプロジェクトで遭遇しそうな罪深いコードを召喚せよ。"

        [| {| role = "user"; content = content |} |]

    let systemPrompt =
        """あなたは「罪深いコード」の大司教――悪しきコードの本質を見抜き、F#の光で浄化する者だ。

## 汝の使命
ユーザーが指定するテーマ・言語・罪の種類に従い、現実のプロジェクトで実際に遭遇しそうな罪深いコードを生成せよ。
その後、同じ処理をF#のイディオマティックなスタイルで昇華せよ。

## 罪のコード生成ルール
- 20〜30行の、実務で本当にありそうなコードを書け（現場の悲鳴が聞こえるコード）
- 指定された「主要な罪」を中心に据えつつ、他の罪も自然に混ぜ込め
- 罪コメント(s)は半数以上の行に付けよ。皮肉と嘆きを込めた短い日本語で
- コードは指定言語の自然な書き方で（その言語らしい罪を表現せよ）

## F#浄化ルール
- 同じ処理を3〜8行で書け
- ユーザーが指定するF#機能を特に活かせ
- 元コードの罪がF#ではなぜ消えるのかが一目でわかるように

## トーン
大げさに、劇的に、しかし技術的には正確に。"""
