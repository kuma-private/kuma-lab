namespace DoubutsuQuiz.Api.Tower

open System
open System.Net.Http
open System.Threading.Tasks
open Microsoft.AspNetCore.Http
open Microsoft.Extensions.DependencyInjection

/// Pass-through proxy for irasutoya PNGs so the tower game can read pixel
/// data client-side (alpha trace → polygon collision bodies). blogger
/// .googleusercontent.com serves images without Access-Control-Allow-Origin
/// headers, so `new Image({crossOrigin:'anonymous'})` fails and the browser
/// taints the canvas, blocking getImageData.
///
/// This handler fetches the upstream image server-side and returns it with
/// permissive CORS headers so the client can draw+read it normally.
module ImageProxy =

    let private allowedHosts =
        Set.ofList [ "blogger.googleusercontent.com"; "1.bp.blogspot.com"; "2.bp.blogspot.com"; "3.bp.blogspot.com"; "4.bp.blogspot.com" ]

    let handler (ctx: HttpContext) : Task =
        task {
            let urlParam = ctx.Request.Query.["url"].ToString()
            if String.IsNullOrWhiteSpace urlParam then
                ctx.Response.StatusCode <- 400
                do! ctx.Response.WriteAsync("missing url")
            else
                match Uri.TryCreate(urlParam, UriKind.Absolute) with
                | false, _ ->
                    ctx.Response.StatusCode <- 400
                    do! ctx.Response.WriteAsync("bad url")
                | true, uri when not (allowedHosts.Contains uri.Host) ->
                    ctx.Response.StatusCode <- 403
                    do! ctx.Response.WriteAsync($"host not allowed: {uri.Host}")
                | true, uri ->
                    let factory = ctx.RequestServices.GetRequiredService<IHttpClientFactory>()
                    let client = factory.CreateClient("ImageProxy")
                    try
                        use! upstream = client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead)
                        if not upstream.IsSuccessStatusCode then
                            ctx.Response.StatusCode <- int upstream.StatusCode
                            do! ctx.Response.WriteAsync($"upstream {int upstream.StatusCode}")
                        else
                            let mime =
                                if isNull upstream.Content.Headers.ContentType then "image/png"
                                else upstream.Content.Headers.ContentType.MediaType
                            ctx.Response.ContentType <- mime
                            ctx.Response.Headers.["Cache-Control"] <- "public, max-age=86400, immutable"
                            ctx.Response.Headers.["Access-Control-Allow-Origin"] <- "*"
                            ctx.Response.Headers.["Timing-Allow-Origin"] <- "*"
                            use! body = upstream.Content.ReadAsStreamAsync()
                            do! body.CopyToAsync(ctx.Response.Body)
                    with ex ->
                        ctx.Response.StatusCode <- 502
                        do! ctx.Response.WriteAsync($"proxy error: {ex.Message}")
        }
