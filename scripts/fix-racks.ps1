# Perbaikan pasca migrate-racks: produk kelas kembali terikat ke rak yang benar.
# Pola aman: id rak selalu dari RE-FETCH (bukan respons insert).
$env2 = Get-Content .env.local | Where-Object { $_ -match '=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  [PSCustomObject]@{ K = $_.Substring(0, $i).Trim(); V = $_.Substring($i + 1).Trim() }
}
$url = ($env2 | Where-Object K -eq 'NEXT_PUBLIC_SUPABASE_URL').V
$key = ($env2 | Where-Object K -eq 'SUPABASE_SERVICE_ROLE_KEY').V
$h = @{ "apikey" = $key; "Authorization" = "Bearer $key"; "Content-Type" = "application/json" }

function Get-Json($path) {
  Invoke-RestMethod -Uri "$url/rest/v1/$path" -Headers $h
}
function Post-Json($path, $obj) {
  Invoke-RestMethod -Method Post -Uri "$url/rest/v1/$path" -Headers $h -Body ($obj | ConvertTo-Json)
}

$targets = @("Matematika|SMA I", "Matematika|SMA II", "IPA / Sains|SMP I", "IPS / Sosial|SMP I", "Bahasa Indonesia|SMA I")

# Pastikan rak ada (buat jika hilang), lalu RE-FETCH id — jangan percaya respons insert.
foreach ($t in $targets) {
  $parts = $t.Split("|")
  $name = $parts[0]; $lvl = $parts[1]
  $row = (Get-Json "categories?select=id&name=eq.$([Uri]::EscapeDataString($name))&level=eq.$([Uri]::EscapeDataString($lvl))") | Select-Object -First 1
  if (-not $row) {
    Post-Json "categories" @{ name = $name; description = ""; level = $lvl } | Out-Null
    "  rak dibuat ulang: $name [$lvl]"
  }
}
$cats = Get-Json "categories?select=id,name,level"
$catId = @{}
foreach ($c in $cats) { $catId[$c.name + "|" + [string]$c.level] = $c.id }

$moves = @(
  @{ n = "Matematika Kelas X";       t = "Matematika|SMA I" },
  @{ n = "Matematika Kelas XI";      t = "Matematika|SMA II" },
  @{ n = "IPA Terpadu Kelas VII";    t = "IPA / Sains|SMP I" },
  @{ n = "IPS Kelas VII";            t = "IPS / Sosial|SMP I" },
  @{ n = "Bahasa Indonesia Kelas X"; t = "Bahasa Indonesia|SMA I" }
)
foreach ($m in $moves) {
  $p = (Get-Json "products?select=id&name=eq.$([Uri]::EscapeDataString($m.n))") | Select-Object -First 1
  if (-not $p) { "  GAGAL (produk tak ditemukan): $($m.n)"; continue }
  $cid = $catId[$m.t]
  if (-not $cid) { "  GAGAL (rak tak ditemukan): $($m.t)"; continue }
  $body = '{"category_id":"' + $cid + '"}'
  Invoke-RestMethod -Method Patch -Uri "$url/rest/v1/products?id=eq.$($p.id)" -Headers $h -Body $body | Out-Null
  "  OK: $($m.n) -> $($m.t)"
}

"---- VERIFIKASI ----"
$fcats  = Get-Json "categories?select=id,name,level&order=name"
$fprods = Get-Json "products?select=id,name,category_id&order=name"
$byId = @{}
foreach ($c in $fcats) {
  $lbl = $(if ([string]::IsNullOrEmpty([string]$c.level)) { $c.name } else { $c.name + ' [' + $c.level + ']' })
  $byId[[string]$c.id] = $lbl
}
foreach ($p in $fprods) {
  $cid = [string]$p.category_id
  if ($cid -eq "" -or $cid -eq "null" -or $cid -eq "00000000-0000-0000-0000-000000000000") {
    "  $($p.name)  =>  (TANPA KATEGORI)"
  } else {
    $lbl = $byId[$cid]
    "  $($p.name)  =>  $(if ($lbl) { $lbl } else { '(ID TIDAK KENAL: ' + $cid + ')' })"
  }
}
