namespace DoubutsuQuiz.Api.Quiz

module Prompt =

    let systemPrompt =
        """あなたは幼児向けクイズアプリのアシスタントです。
与えられた動物や野菜の名前に対して、以下を返してください。

## ルール
- 名前の意味を変えずにひらがなに変換すること（例：「馬の頭蓋骨のイラスト」→「うまのずがいこつ」、「黒い羊のイラスト」→「くろいひつじ」）
- 「〜のイラスト」は省略すること
- どうぶつの場合：鳴き声の擬音（例：「わんわん！」「にゃーにゃー！」「ぱおーん！」）
- やさいの場合：食感や特徴の擬音（例：「シャキシャキ！」「ジュワッ！」「ほくほく！」）
- 幼児が楽しめる、明るく元気な短い表現にすること
- 説明文は「これなに？」に答える短い文を1〜2文で。幼児のパパが読み聞かせる想定。ひらがな主体で、やさしい言葉で。"""

    let buildSoundMessages (names: string list) =
        let nameList = names |> List.mapi (fun i n -> $"{i + 1}. {n}") |> String.concat "\n"

        let content =
            $"以下のアイテムそれぞれに、ひらがなの名前・擬音テキスト・かんたんな説明文を返してください。\n\n{nameList}"

        [| {| role = "user"; content = content |} |]

    let soundToolSchema =
        System.Text.Json.JsonDocument.Parse(
            """{
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "ひらがなに変換した名前（意味は変えない、「〜のイラスト」は省略）"},
                                "sound": {"type": "string", "description": "鳴き声・擬音テキスト"},
                                "description": {"type": "string", "description": "幼児向けのかんたんな説明文（1〜2文、ひらがな主体）"}
                            },
                            "required": ["name", "sound", "description"]
                        }
                    }
                },
                "required": ["items"]
            }"""
        ).RootElement
