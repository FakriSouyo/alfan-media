# Ukur TTFT (time-to-first-token) + kecepatan generation endpoint bitdeer.
# Konfigurasi provider dibaca dari Supabase (ai_settings + ai_providers).
# API key TIDAK pernah dicetak.
$env2 = Get-Content .env.local | Where-Object { $_ -match '=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  [PSCustomObject]@{ K = $_.Substring(0, $i).Trim(); V = $_.Substring($i + 1).Trim() }
}
$url = ($env2 | Where-Object K -eq 'NEXT_PUBLIC_SUPABASE_URL').V
$key = ($env2 | Where-Object K -eq 'SUPABASE_SERVICE_ROLE_KEY').V
$h = @{ "apikey" = $key; "Authorization" = "Bearer $key" }

$settings = Invoke-RestMethod -Uri "$url/rest/v1/ai_settings?select=provider_id,model_id&id=eq.1" -Headers $h
if (-not $settings) { "Belum ada ai_settings aktif"; exit 1 }
$prov = Invoke-RestMethod -Uri "$url/rest/v1/ai_providers?select=provider_id,display_name,base_url,api_key" -Headers $h
$row = $prov | Where-Object { $_.provider_id -eq $settings.provider_id } | Select-Object -First 1
if (-not $row) { "Provider $($settings.provider_id) tidak ditemukan"; exit 1 }

$endpoint = ($row.base_url.TrimEnd('/')) + "/chat/completions"
"Provider : $($row.display_name) (slug $($row.provider_id))"
"Model    : $($settings.model_id)"
"Endpoint : $endpoint"
""

$body = @{
  model   = $settings.model_id
  messages = @( @{ role = "user"; content = "halo" } )
  stream  = $true
  max_tokens = 60
} | ConvertTo-Json -Depth 5

Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$client  = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(90)
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $row.api_key)
$content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")

$watch = [System.Diagnostics.Stopwatch]::StartNew()
$resp  = $client.PostAsync($endpoint, $content).Result
$watchHeader = $watch.ElapsedMilliseconds
if (-not $resp.IsSuccessStatusCode) {
  "GAGAL: HTTP $([int]$resp.StatusCode) $(($resp.Content.ReadAsStringAsync().Result).Substring(0, [Math]::Min(200, 200)))"
  exit 1
}
$stream = $resp.Content.ReadAsStreamAsync().Result
$reader = [System.IO.StreamReader]::new($stream)
$ttft = $null
$chunks = 0
$textLen = 0
while (-not $reader.EndOfStream) {
  $line = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if (-not $line.StartsWith("data:")) { continue }
  $payload = $line.Substring(5).Trim()
  if ($payload -eq "[DONE]") { break }
  $json = $payload | ConvertFrom-Json
  $delta = $json.choices[0].delta
  if ($delta.content) {
    $textLen += $delta.content.Length
    if ($null -eq $ttft) { $ttft = $watch.ElapsedMilliseconds }
    $chunks++
  }
}
$watch.Stop()

"Header   : ${watchHeader} ms"
"TTFT     : $(if ($null -ne $ttft) { "$ttft ms" } else { 'TAK ADA token (respons kosong / tool call?)' })"
"Total    : $($watch.ElapsedMilliseconds) ms"
"Chunk    : $chunks (kira-kira $($chunks) token)"
"Char teks: $textLen"
if ($null -ne $ttft -and $watch.ElapsedMilliseconds -gt $ttft -and $chunks -gt 1) {
  $genMs = $watch.ElapsedMilliseconds - $ttft
  "Generation: $genMs ms untuk ~$($chunks-1) token = ~$([math]::Round(($chunks-1)*1000/$genMs, 1)) tok/dtk"
}
