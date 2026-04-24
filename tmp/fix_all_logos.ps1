$pages = @('gifts.html','men.html','women.html','accessories.html','cart.html','checkout.html','account.html','faq.html','login.html','register.html','track.html','wishlist.html','privacy-policy.html','terms-and-conditions.html','return-exchange-policy.html','return-refund-policy.html','products\product.html')

$oldLogo = '<div class="logo"><img src="logo.png" alt="CALVORO"></div>'
$oldLogoRel = '<div class="logo"><img src="../logo.png" alt="CALVORO"></div>'
$newLogo = '<div class="logo"><a href="index.html" aria-label="CALVORO Home"><img src="logo.png" alt="CALVORO"></a></div>'
$newLogoRel = '<div class="logo"><a href="../index.html" aria-label="CALVORO Home"><img src="../logo.png" alt="CALVORO"></a></div>'

$count = 0
foreach ($page in $pages) {
    if (Test-Path $page) {
        $c = Get-Content $page -Raw
        $changed = $false
        if ($page.StartsWith('products')) {
            if ($c.Contains($oldLogoRel)) {
                $c = $c.Replace($oldLogoRel, $newLogoRel)
                $changed = $true
            } elseif ($c.Contains($oldLogo)) {
                $c = $c.Replace($oldLogo, $newLogo)
                $changed = $true
            }
        } else {
            if ($c.Contains($oldLogo)) {
                $c = $c.Replace($oldLogo, $newLogo)
                $changed = $true
            }
        }
        if ($changed) {
            Set-Content $page $c -NoNewline -Encoding UTF8
            Write-Host "Fixed: $page"
            $count++
        } else {
            Write-Host "Skipped (not found): $page"
        }
    } else {
        Write-Host "Missing: $page"
    }
}
Write-Host "Total fixed: $count"
