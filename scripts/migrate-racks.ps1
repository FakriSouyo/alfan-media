# Migrasi rak LKS: kategori = mapel + kelas; produk kelas dipindah ke rak berkelas.
# Aman: kategori dihapus hanya jika benar-benar kosong saat itu.
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

$cats  = Get-Json "categories?select=id,name,level"
$prods = Get-Json "products?select=id,name,category_id"

# Rak target: name|level
$targets = @("Matematika|SMA I", "Matematika|SMA II", "IPA / Sains|SMP I", "IPS / Sosial|SMP I", "Bahasa Indonesia|SMA I")
$catId = @{}
foreach ($t in $targets) {
  $parts = $t.Split("|")
  $name = $parts[0]; $lvl = $parts[1]
  $existing = $cats | Where-Object { $_.name -eq $name -and $_.level -eq $lvl } | Select-Object -First 1
  if ($existing) {
    $catId[$t] = $existing.id
    "  rak ada : $name [$lvl]"
  } else {
    $created = Post-Json "categories" @{ name = $name; description = ""; level = $lvl }
    $catId[$t] = $created.id
    "  rak baru: $name [$lvl]"
  }
}

# Peta produk → rak target (match nama persis)
$moves = @(
  @{ n = "Matematika Kelas X";       t = "Matematika|SMA I" },
  @{ n = "Matematika Kelas XI";      t = "Matematika|SMA II" },
  @{ n = "IPA Terpadu Kelas VII";    t = "IPA / Sains|SMP I" },
  @{ n = "IPS Kelas VII";            t = "IPS / Sosial|SMP I" },
  @{ n = "Bahasa Indonesia Kelas X"; t = "Bahasa Indonesia|SMA I" }
)
foreach ($m in $moves) {
  $p = $prods | Where-Object { $_.name -eq $m.n } | Select-Object -First 1
  if (-not $p) { "  SKIP (produk tak ditemukan): $($m.n)"; continue }
  $h2 = @{ "apikey" = $key; "Authorization" = "Bearer $key"; "Content-Type" = "application/json"; "Prefer" = "resolution=ignore-duplicates" }
  Invoke-RestMethod -Method Patch -Uri "$url/rest/v1/products?id=eq.$($p.id)" -Headers $h2 -Body (@{ category_id = $catId[$m.t] } | ConvertTo-Json) | Out-Null
  $lvlLabel = ($m.t.Split("|"))[1]
  "  pindah  : $($m.n) -> [$lvlLabel]"
}

# Hapus rak yang kini kosong: kategori lama tanpa kelas + Bahasa Indonesia [SMA III]
$toPurge = @(
  @{ name = "Matematika";       lvl = $null },
  @{ name = "IPA / Sains";      lvl = $null },
  @{ name = "IPS / Sosial";     lvl = $null },
  @{ name = "Bahasa Indonesia"; lvl = "SMA III" }
)
foreach ($c in $toPurge) {
  $cat = $cats | Where-Object {
    $_.name -eq $c.name -and
    $(if ($c.lvl -eq $null) { [string]::IsNullOrEmpty($_.level) } else { $_.level -eq $c.lvl })
  } | Select-Object -First 1
  if (-not $cat) { "  rak tak ada (lewati): $($c.name)"; continue }
  $count = (Get-Json "products?select=id&category_id=eq.$($cat.id)").Count
  if ($count -gt 0) {
    "  TETAP  : $($c.name) masih dipakai $count produk"
  } else {
    Invoke-RestMethod -Method Delete -Uri "$url/rest/v1/categories?id=eq.$($cat.id)" -Headers $h | Out-Null
    "  hapus  : $($c.name)$(if ($c.lvl) { " [$($c.lvl)]" }) (kosong)"
  }
}

# Verifikasi akhir
"---- HASIL ----"
$fcats  = Get-Json "categories?select=name,level&order=name"
$fprods = Get-Json "products?select=name,category_id&order=name"
$byId = @{}
foreach ($c in $fcats) { $byId[$c.id] = "$(if ([string]::IsNullOrEmpty($c.level)) { $c.name } else { $c.name + ' [' + $c.level + ']' })" }
foreach ($p in $fprods) {
  $label = $(if ($p.category_id) { $byId[$p.category_id] } else { "(tanpa kategori)" })
  "  $($p.name)  =>  $label"
}
