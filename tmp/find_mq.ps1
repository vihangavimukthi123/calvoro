$c = Get-Content 'css\styles.css' -Raw
$matches2 = [regex]::Matches($c, '@media \(max-width: 768px\)')
foreach ($m in $matches2) {
    $snippet = $c.Substring($m.Index, [Math]::Min(150,$c.Length-$m.Index))
    Write-Host "At byte $($m.Index): $($snippet.Substring(0,100).Replace("`r","").Replace("`n"," | "))"
}
Write-Host "Total: $($matches2.Count)"
