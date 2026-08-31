# Ukur TTFT dengan payload REALISTIS: system prompt asli (diekstrak dari
# orchestrator.ts) + definisi tool + pertanyaan data (biasanya memicu tool call
# → ronde 1; ini struktur latensi multi-ronde yang dialami pengguna).
Add-Type -AssemblyName System.Net.Http

$env2 = Get-Content .env.local | Where-Object { $_ -match '=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  [PSCustomObject]@{ K = $_.Substring(0, $i).Trim(); V = $_.Substring($i + 1).Trim() }
}
$url = ($env2 | Where-Object K -eq 'NEXT_PUBLIC_SUPABASE_URL').V
$key = ($env2 | Where-Object K -eq 'SUPABASE_SERVICE_ROLE_KEY').V
$h = @{ "apikey" = $key; "Authorization" = "Bearer $key" }

$settings = Invoke-RestMethod -Uri "$url/rest/v1/ai_settings?select=provider_id,model_id&id=eq.1" -Headers $h
$prov = Invoke-RestMethod -Uri "$url/rest/v1/ai_providers?select=provider_id,display_name,base_url,api_key" -Headers $h
$row = $prov | Where-Object { $_.provider_id -eq $settings.provider_id } | Select-Object -First 1
$endpoint = ($row.base_url.TrimEnd('/')) + "/chat/completions"
"Model: $($settings.model_id) via $($row.display_name)"

# Ekstrak SYSTEM_PROMPT asli dari source (template literal).
$src = Get-Content (Join-Path (Get-Location) 'src/lib/agent/llm/orchestrator.ts') -Raw
$ms = [regex]::Match($src, 'const SYSTEM_PROMPT = `(.*?)`', 'Singleline')
$systemPrompt = $ms.Groups[1].Value
"System prompt: $($systemPrompt.Length) char"

# Tools: nama asli + deskripsi singkat (ukuran mirip nyata) — JSON mentah.
$toolsJson = @'
[
  {"type":"function","function":{"name":"get_today_sales","description":"Penjualan hari ini","parameters":{"type":"object","properties":{}}}},
  {"type":"function","function":{"name":"get_sales","description":"Penjualan periode tertentu","parameters":{"type":"object","properties":{"period":{"type":"string"}}}}},
  {"type":"function","function":{"name":"get_low_stock","description":"Produk stok rendah","parameters":{"type":"object","properties":{"threshold":{"type":"integer"}}}}},
  {"type":"function","function":{"name":"search_products","description":"Cari produk","parameters":{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}}},
  {"type":"function","function":{"name":"get_product","description":"Detail produk","parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}}},
  {"type":"function","function":{"name":"update_stock","description":"Ubah stok produk","parameters":{"type":"object","properties":{"id":{"type":"string"},"delta":{"type":"integer"}}}}},
  {"type":"function","function":{"name":"create_product","description":"Buat produk baru","parameters":{"type":"object","properties":{"name":{"type":"string"},"category":{"type":"string"}}}}},
  {"type":"function","function":{"name":"get_orders","description":"Daftar pesanan","parameters":{"type":"object","properties":{}}}},
  {"type":"function","function":{"name":"get_top_products","description":"Produk terlaris","parameters":{"type":"object","properties":{}}}},
  {"type":"function","function":{"name":"get_store_stats","description":"Statistik toko","parameters":{"type":"object","properties":{}}}}
]
'@

# Susun body JSON manual agar elemen tools (array) masuk apa adanya.
$body = '{"model":"' + $settings.model_id + '","messages":[{"role":"system","content":' +
  ( ($systemPrompt | ConvertTo-Json) ) + '},{"role":"user","content":"Berapa penjualan hari ini?"}],"stream":true,"tool_choice":"auto","tools":' +
  $toolsJson + '}'

$client  = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(120)
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $row.api_key)
$content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")

$watch = [System.Diagnostics.Stopwatch]::StartNew()
$resp  = $client.PostAsync($endpoint, $content).Result
$headerMs = $watch.ElapsedMilliseconds
if (-not $resp.IsSuccessStatusCode) {
  "GAGAL: HTTP $([int]$resp.StatusCode)"
  exit 1
}
$reader = [System.IO.StreamReader]::new($resp.Content.ReadAsStreamAsync().Result)
$firstToken = $null
$chunks = 0
$sawToolCall = $false
$sawContent = $false
$finishReason = $null
while (-not $reader.EndOfStream) {
  $line = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if (-not $line.StartsWith("data:")) { continue }
  $payload = $line.Substring(5).Trim()
  if ($payload -eq "[DONE]") { break }
  try { $json = $payload | ConvertFrom-Json } catch { continue }
  $choice = $json.choices[0]
  if ($choice.finish_reason) { $finishReason = $choice.finish_reason }
  $delta = $choice.delta
  if ($delta.content) {
    if (-not $sawContent) { if ($null -eq $firstToken) { $firstToken = $watch.ElapsedMilliseconds } ; $sawContent = $true }
    $chunks++
  }
  if ($delta.tool_calls) {
    $sawToolCall = $true
    if ($null -eq $firstToken) { $firstToken = $watch.ElapsedMilliseconds }
    $chunks++
  }
}
$watch.Stop()

"Header     : ${headerMs} ms"
"Token 1    : $(if ($null -ne $firstToken) { "$firstToken ms" } else { 'tidak ada' })"
"Total      : $($watch.ElapsedMilliseconds) ms"
"Ilir     : $(if ($sawToolCall) { 'TOOL CALL (ronde 1 — tidak ada teks ke pengguna)' } elseif ($sawContent) { 'teks langsung' } else { 'kosong' })"
"Finish     : $finishReason"
"Chunk      : $chunks"
if ($sawToolCall) {
  ""
  "=> Ronde 2 (jawaban final) akan membayar TTFT sekali lagi. Latensi pengguna"
  "   = TTFT ronde1 + eksekusi tool + TTFT ronde2 + streaming jawaban."
}
