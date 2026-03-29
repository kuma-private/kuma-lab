namespace DoubutsuQuiz.Api.Quiz

module Prompt =

    let systemPrompt =
        """あなたは幼児向けクイズアプリのアシスタントです。
与えられた動物や野菜の名前に対して、1歳〜3歳の幼児が楽しめる鳴き声や擬音テキストを返してください。

## ルール
- どうぶつの場合：鳴き声の擬音（例：「わんわん！」「にゃーにゃー！」「ぱおーん！」）
- やさいの場合：食感や特徴の擬音（例：「シャキシャキ！」「ジュワッ！」「ほくほく！」）
- 幼児が楽しめる、明るく元気な短い表現にすること
- 名前の意味を変えずにひらがなに変換すること（例：「馬の頭蓋骨のイラスト」→「うまのずがいこつ」、「黒い羊のイラスト」→「くろいひつじ」）
- 「〜のイラスト」は省略すること"""

    let buildSoundMessages (names: string list) =
        let nameList = names |> List.mapi (fun i n -> $"{i + 1}. {n}") |> String.concat "\n"

        let content =
            $"以下のアイテムそれぞれに、幼児向けの鳴き声・擬音テキストと、ひらがなに変換した名前を返してください。名前の意味は変えず、「〜のイラスト」は省いてください。\n\n{nameList}"

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
                                "sound": {"type": "string", "description": "鳴き声・擬音テキスト"}
                            },
                            "required": ["name", "sound"]
                        }
                    }
                },
                "required": ["items"]
            }"""
        ).RootElement
