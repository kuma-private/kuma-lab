namespace CodeShinkou.Api.Analysis

open System
open System.Diagnostics
open System.IO
open System.Threading.Tasks

module YtDlpClient =

    let extractAudio (url: string) (startTime: float) (endTime: float) : Task<Result<string, string>> =
        task {
            let tempDir = Path.GetTempPath()
            let outputId = Guid.NewGuid().ToString("N")
            let outputPath = Path.Combine(tempDir, $"{outputId}.wav")

            let startStr = TimeSpan.FromSeconds(startTime).ToString(@"hh\:mm\:ss\.ff")
            let endStr = TimeSpan.FromSeconds(endTime).ToString(@"hh\:mm\:ss\.ff")

            let args =
                $"--no-playlist -x --audio-format wav --download-sections \"*{startStr}-{endStr}\" --force-keyframes-at-cuts -o \"{outputPath}\" \"{url}\""

            let psi = ProcessStartInfo()
            psi.FileName <- "yt-dlp"
            psi.Arguments <- args
            psi.RedirectStandardOutput <- true
            psi.RedirectStandardError <- true
            psi.UseShellExecute <- false
            psi.CreateNoWindow <- true

            try
                use proc = Process.Start(psi)
                let! _ = proc.StandardOutput.ReadToEndAsync()
                let! stderr = proc.StandardError.ReadToEndAsync()
                do! proc.WaitForExitAsync()

                if proc.ExitCode <> 0 then
                    return Error $"yt-dlp failed (exit {proc.ExitCode}): {stderr.[..min 500 (stderr.Length - 1)]}"
                else
                    // yt-dlp may append section suffix to filename
                    let candidates =
                        Directory.GetFiles(tempDir, $"{outputId}*")
                        |> Array.filter (fun f -> f.EndsWith(".wav"))

                    match candidates |> Array.tryHead with
                    | Some path -> return Ok path
                    | None -> return Error "yt-dlp produced no wav output"
            with ex ->
                return Error $"Failed to run yt-dlp: {ex.Message}"
        }
