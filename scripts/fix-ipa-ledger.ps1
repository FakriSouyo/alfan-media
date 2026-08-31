$env2 = Get-Content .env.local | Where-Object { $_ -match '=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  [PSCustomObject]@{ K = $_.Substring(0, $i).Trim(); V = $_.Substring($i + 1).Trim() }
}
$url = ($env2 | Where-Object K -eq 'NEXT_PUBLIC_SUPABASE_URL').V
$key = ($env2 | Where-Object K -eq 'SUPABASE_SERVICE_ROLE_KEY').V
$h = @{ "apikey" = $key; "Authorization" = "Bearer $key"; "Content-Type" = "application/json"; "Prefer" = "return=representation" }

$pid_ = "33333333-3333-3333-3333-000000000004"

# Admin user (created_by) — profile pertama dengan role admin.
$profiles = Invoke-RestMethod -Uri "$url/rest/v1/profiles?select=id&role=eq.admin&limit=1" -Headers $h
$by = $profiles[0].id
"created_by: $by"

# Koreksi +4: menutup defisit −4 (seed SALE −45 + INV-005 over-sell).
$body = @{
  product_id = $pid_
  type       = "ADJUSTMENT"
  quantity   = 4
  reference  = "Koreksi saldo: menutup selisih seed/over-sell (-4)"
  created_by = $by
} | ConvertTo-Json
$ins = Invoke-RestMethod -Method Post -Uri "$url/rest/v1/stock_movements" -Headers $h -Body $body
"Inserted movement: $($ins.id)"

# Verifikasi: stok produk + total ledger.
$p = Invoke-RestMethod -Uri "$url/rest/v1/products?select=id,name,stock,updated_at&id=eq.$pid_" -Headers $h
"Produk sekarang: $($p[0].name) | stock=$($p[0].stock)"
$movs = Invoke-RestMethod -Uri "$url/rest/v1/stock_movements?select=type,quantity&product_id=eq.$pid_" -Headers $h
$sum = 0; foreach ($m in $movs) { $sum += $m.quantity }
"Total ledger: $sum (harus 0)"
