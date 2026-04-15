namespace DoubutsuQuiz.Api.Ehon

open System
open DoubutsuQuiz.Api.Quiz

module SamplePicker =

    type Mode =
        | Chaos
        | Cosmos

    type SamplingInput =
        { Mode: Mode
          PageCount: int
          Protagonist: string option
          Setting: string option
          Theme: string option
          ProtagonistImageDataUrl: string option }

    let sampleSize = 20

    let cosmosBlockedCategories =
        Set.ofList [
            "事故"; "違反"; "病気"; "医療"; "ビジネス"; "会社"
            "お金"; "災害"; "犯罪"; "葬式"; "戦争"; "ハラスメント"
            "事件"; "裁判"; "逮捕"; "暴力"; "離婚"; "借金"
        ]

    let private backgroundCategories =
        Set.ofList [
            "風景"; "海"; "山"; "植物"; "天気"; "公園"; "田舎"; "空"
            "自然"; "森"; "川"; "街"; "町"
        ]

    let private characterCategories =
        Set.ofList [
            "こども"; "動物"; "動物キャラ"; "老人"; "家族"; "キャラクター"
            "若者"; "人"; "人物"; "魚"; "鳥"; "虫"
        ]

    let private objectCategories =
        Set.ofList [
            "フルーツ"; "スイーツ"; "食べ物"; "おもちゃ"; "花"; "道具"
            "飲み物"; "料理"; "食事"; "野菜"; "くだもの"
        ]

    let private decorationCategories =
        Set.ofList [
            "紅葉"; "桜"; "ファンタジー"; "お正月"; "夏"; "冬"; "春"; "秋"
            "クリスマス"; "ハロウィン"; "マーク"; "記号"
        ]

    let private rng = Random.Shared

    let private hasUsableImage (entry: IrasutoyaIndex.Entry) =
        not (isNull entry.ImageUrls) && entry.ImageUrls.Length > 0

    let private categoriesOf (entry: IrasutoyaIndex.Entry) : string array =
        if isNull entry.Categories then [||] else entry.Categories

    let private isBlocked (entry: IrasutoyaIndex.Entry) : bool =
        categoriesOf entry
        |> Array.exists (fun c -> cosmosBlockedCategories.Contains c)

    let private matchesAny (categories: Set<string>) (entry: IrasutoyaIndex.Entry) : bool =
        categoriesOf entry
        |> Array.exists (fun c -> categories.Contains c)

    let private shuffleInPlace (arr: 'a array) : unit =
        let n = arr.Length
        for i in 0 .. n - 2 do
            let j = rng.Next(i, n)
            let tmp = arr.[i]
            arr.[i] <- arr.[j]
            arr.[j] <- tmp

    let private takeDistinct
        (source: IrasutoyaIndex.Entry array)
        (want: int)
        (already: System.Collections.Generic.HashSet<string>)
        : IrasutoyaIndex.Entry list =
        if want <= 0 || source.Length = 0 then
            []
        else
            let pool = Array.copy source
            shuffleInPlace pool

            let mutable taken = []
            let mutable i = 0
            let mutable count = 0
            while count < want && i < pool.Length do
                let e = pool.[i]
                if already.Add e.Id then
                    taken <- e :: taken
                    count <- count + 1
                i <- i + 1

            List.rev taken

    let private pickChaos (index: IrasutoyaIndex.Index) : IrasutoyaIndex.Entry array =
        let usable =
            index.Entries
            |> Array.filter hasUsableImage

        if usable.Length < sampleSize then
            failwithf
                "SamplePicker.chaos: only %d usable entries, need %d"
                usable.Length
                sampleSize

        let picked =
            takeDistinct usable sampleSize (System.Collections.Generic.HashSet<string>())

        List.toArray picked

    let private pickCosmos (index: IrasutoyaIndex.Index) : IrasutoyaIndex.Entry array =
        let eligible =
            index.Entries
            |> Array.filter (fun e -> hasUsableImage e && not (isBlocked e))

        if eligible.Length < sampleSize then
            failwithf
                "SamplePicker.cosmos: only %d eligible entries after blocklist, need %d"
                eligible.Length
                sampleSize

        let used = System.Collections.Generic.HashSet<string>()

        let backgrounds =
            eligible |> Array.filter (matchesAny backgroundCategories)

        let characters =
            eligible |> Array.filter (matchesAny characterCategories)

        let objects =
            eligible |> Array.filter (matchesAny objectCategories)

        let decorations =
            eligible |> Array.filter (matchesAny decorationCategories)

        let bgPicked = takeDistinct backgrounds 3 used
        let charPicked = takeDistinct characters 8 used
        let objPicked = takeDistinct objects 6 used
        let decoPicked = takeDistinct decorations 3 used

        let primary =
            bgPicked @ charPicked @ objPicked @ decoPicked

        let remaining = sampleSize - List.length primary

        let fillers =
            if remaining > 0 then
                takeDistinct eligible remaining used
            else
                []

        let combined = primary @ fillers

        if List.length combined < sampleSize then
            failwithf
                "SamplePicker.cosmos: could only assemble %d entries, need %d"
                (List.length combined)
                sampleSize

        combined
        |> List.truncate sampleSize
        |> List.toArray

    /// Nazenaze variant: blend search-based relevant hits for the supplied
    /// keywords with the cosmos category-balanced fallback. Relevant hits are
    /// placed first so Claude notices them in the catalog order.
    ///
    /// - Blocked categories (事故/犯罪/etc) are always filtered out.
    /// - If search returns 0 hits (bad keywords, index miss), we fall back to
    ///   pure pickCosmos so the flow never fails on sampling.
    let pickCosmosWithKeywords
        (index: IrasutoyaIndex.Index)
        (keywords: string array)
        : IrasutoyaIndex.Entry array =
        let relevantWant = 12

        let relevant : IrasutoyaIndex.Entry list =
            if isNull keywords || keywords.Length = 0 then []
            else
                let query = String.concat " " keywords
                let hits = IrasutoyaIndex.search index query 60
                hits
                |> List.map (fun h -> h.Entry)
                |> List.filter (fun e -> hasUsableImage e && not (isBlocked e))
                |> List.truncate relevantWant

        let usedIds =
            let s = System.Collections.Generic.HashSet<string>()
            for e in relevant do s.Add e.Id |> ignore
            s

        let fallback = pickCosmos index

        let fallbackFiltered =
            fallback
            |> Array.filter (fun e -> not (usedIds.Contains e.Id))

        let combined =
            Array.append (List.toArray relevant) fallbackFiltered

        if combined.Length >= sampleSize then
            Array.sub combined 0 sampleSize
        else
            // Extremely unlikely — pickCosmos already guarantees 20 disjoint
            // entries, so combined is always ≥ 20 after filtering. Keep a safe
            // pad just in case.
            combined

    let pickSamples
        (index: IrasutoyaIndex.Index)
        (input: SamplingInput)
        : IrasutoyaIndex.Entry array =
        let baseSamples =
            match input.Mode with
            | Chaos -> pickChaos index
            | Cosmos -> pickCosmos index

        match input.ProtagonistImageDataUrl with
        | Some dataUrl when dataUrl.Length > 0 ->
            let userEntry : IrasutoyaIndex.Entry =
                { Id = "user_protagonist_image"
                  PageUrl = ""
                  Title = (input.Protagonist |> Option.defaultValue "ぼく")
                  Description = "ユーザーがアップロードした主人公"
                  ImageUrls = [| dataUrl |]
                  Categories = [| "ユーザー作成" |]
                  PublishedAt = "" }
            Array.append [| userEntry |] baseSamples
        | _ -> baseSamples
