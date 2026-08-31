$env2 = Get-Content .env.local | Where-Object { $_ -match '=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  [PSCustomObject]@{ K = $_.Substring(0, $i).Trim(); V = $_.Substring($i + 1).Trim() }
}
$url = ($env2 | Where-Object K -eq 'NEXT_PUBLIC_SUPABASE_URL').V
$key = ($env2 | Where-Object K -eq 'SUPABASE_SERVICE_ROLE_KEY').V
$h = @{ "apikey" = $key; "Authorization" = "Bearer $key" }

$prods = Invoke-RestMethod -Uri "$url/rest/v1/products?select=id,name,stock" -Headers $h
$movs  = Invoke-RestMethod -Uri "$url/rest/v1/stock_movements?select=product_id,quantity" -Headers $h

$sums = @{}
foreach ($m in $movs) {
  $cur = if ($sums.ContainsKey($m.product_id)) { $sums[$m.product_id] } else { 0 }
  $sums[$m.product_id] = $cur + $m.quantity
}

$rows = foreach ($p in $prods) {
  $net = if ($sums.ContainsKey($p.id)) { $sums[$p.id] } else { 0 }
  [PSCustomObject]@{
    name      = $p.name
    displayed = $p.stock
    ledgerNet = $net
    deficit   = [Math]::Max(0, -$net)
  }
}
$rows | Sort-Object deficit -Descending | Format-Table -AutoSize
