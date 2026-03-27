module SinSublimation.Tests.ParserTests

open Xunit
open SinSublimation.Api.Purification

[<Fact>]
let ``Valid JSON parses correctly`` () =
    let json =
        """
        {
          "theme": "FizzBuzz",
          "lang": "Java",
          "lines": [
            {"c": "public class FizzBuzz {", "s": null},
            {"c": "  public static void main(String[] args) {", "s": "冗長なボイラープレート"},
            {"c": "    for (int i = 1; i <= 100; i++) {", "s": null},
            {"c": "      String result = \"\";", "s": "可変な状態"},
            {"c": "      if (i % 3 == 0) result += \"Fizz\";", "s": null},
            {"c": "      if (i % 5 == 0) result += \"Buzz\";", "s": null},
            {"c": "      if (result.equals(\"\")) result = String.valueOf(i);", "s": "null危険"},
            {"c": "      System.out.println(result);", "s": "副作用"},
            {"c": "    }", "s": null},
            {"c": "  }", "s": null},
            {"c": "}", "s": null},
            {"c": "// end of FizzBuzz", "s": "不要コメント"}
          ],
          "fs": "[1..100] |> List.map (fun i -> match i%3, i%5 with 0,0 -> \"FizzBuzz\" | 0,_ -> \"Fizz\" | _,0 -> \"Buzz\" | _ -> string i) |> List.iter (printfn \"%s\")",
          "why": "パターンマッチと不変データで副作用を最小化"
        }
        """

    match Parser.parse json with
    | Ok result ->
        Assert.Equal("FizzBuzz", result.Theme)
        Assert.Equal("Java", result.Lang)
        Assert.Equal(12, result.Lines.Length)
        Assert.Equal("public class FizzBuzz {", result.Lines.[0].Code)
        Assert.True(result.Lines.[0].Sin.IsNone)
        Assert.True(result.Lines.[1].Sin.IsSome)
        Assert.Equal("冗長なボイラープレート", result.Lines.[1].Sin.Value)
        Assert.False(System.String.IsNullOrEmpty(result.Fs))
        Assert.False(System.String.IsNullOrEmpty(result.Why))
    | Error err -> Assert.Fail($"Expected Ok but got Error: {err}")

[<Fact>]
let ``Malformed JSON returns Error`` () =
    let json = "this is not json at all"

    match Parser.parse json with
    | Ok _ -> Assert.Fail("Expected Error but got Ok")
    | Error err -> Assert.Contains("JSON parse error", err)

[<Fact>]
let ``Missing theme field returns Error`` () =
    let json =
        """
        {
          "lang": "Python",
          "lines": [{"c": "print('hello')", "s": null}],
          "fs": "printfn \"hello\"",
          "why": "simple"
        }
        """

    match Parser.parse json with
    | Ok _ -> Assert.Fail("Expected Error but got Ok")
    | Error err -> Assert.Contains("theme", err)

[<Fact>]
let ``Missing lines field returns Error`` () =
    let json =
        """
        {
          "theme": "Hello",
          "lang": "Python",
          "fs": "printfn \"hello\"",
          "why": "simple"
        }
        """

    match Parser.parse json with
    | Ok _ -> Assert.Fail("Expected Error but got Ok")
    | Error err -> Assert.Contains("lines", err)

[<Fact>]
let ``Missing lang field returns Error`` () =
    let json =
        """
        {
          "theme": "Hello",
          "lines": [{"c": "print('hello')", "s": null}],
          "fs": "printfn \"hello\"",
          "why": "simple"
        }
        """

    match Parser.parse json with
    | Ok _ -> Assert.Fail("Expected Error but got Ok")
    | Error err -> Assert.Contains("lang", err)

[<Fact>]
let ``Sin field with null parses as None`` () =
    let json =
        """
        {
          "theme": "Test",
          "lang": "JS",
          "lines": [{"c": "var x = 1;", "s": null}],
          "fs": "let x = 1",
          "why": "immutable"
        }
        """

    match Parser.parse json with
    | Ok result ->
        Assert.Equal(1, result.Lines.Length)
        Assert.True(result.Lines.[0].Sin.IsNone)
    | Error err -> Assert.Fail($"Expected Ok but got Error: {err}")

[<Fact>]
let ``Sin field with value parses as Some`` () =
    let json =
        """
        {
          "theme": "Test",
          "lang": "JS",
          "lines": [{"c": "var x = null;", "s": "null地獄"}],
          "fs": "let x = None",
          "why": "Option type"
        }
        """

    match Parser.parse json with
    | Ok result ->
        Assert.Equal(1, result.Lines.Length)
        Assert.Equal(Some "null地獄", result.Lines.[0].Sin)
    | Error err -> Assert.Fail($"Expected Ok but got Error: {err}")
