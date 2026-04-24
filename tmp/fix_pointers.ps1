$c = Get-Content 'css\styles.css' -Raw

# Fix 1: Add pointer-events:none to cart-drawer-overlay when not active
$old1 = ".cart-drawer-overlay {`r`n    position: fixed;`r`n    inset: 0;`r`n    z-index: 10000;`r`n    opacity: 0;`r`n    visibility: hidden;`r`n    transition: opacity 0.3s ease, visibility 0.3s ease;`r`n    display: flex;`r`n    flex-direction: row;`r`n    align-items: stretch;`r`n    justify-content: flex-end;`r`n}`r`n.cart-drawer-overlay.active {`r`n    opacity: 1;`r`n    visibility: visible;`r`n}"

$new1 = ".cart-drawer-overlay {`r`n    position: fixed;`r`n    inset: 0;`r`n    z-index: 10000;`r`n    opacity: 0;`r`n    visibility: hidden;`r`n    pointer-events: none;`r`n    transition: opacity 0.3s ease, visibility 0.3s ease;`r`n    display: flex;`r`n    flex-direction: row;`r`n    align-items: stretch;`r`n    justify-content: flex-end;`r`n}`r`n.cart-drawer-overlay.active {`r`n    opacity: 1;`r`n    visibility: visible;`r`n    pointer-events: auto;`r`n}"

if ($c.Contains($old1)) {
    $c = $c.Replace($old1, $new1)
    Write-Host "Fixed cart-drawer-overlay"
} else {
    Write-Host "cart-drawer-overlay not found with CRLF, trying LF..."
    $old1LF = $old1.Replace("`r`n", "`n")
    $new1LF = $new1.Replace("`r`n", "`n")
    if ($c.Contains($old1LF)) {
        $c = $c.Replace($old1LF, $new1LF)
        Write-Host "Fixed cart-drawer-overlay (LF)"
    } else {
        Write-Host "ERROR: cart-drawer-overlay not found"
    }
}

# Fix 2: Also add pointer-events:none to search-overlay when not active
$searchOld = ".search-overlay {`r`n    display: none;`r`n    position: fixed;`r`n    top: 0;`r`n    left: 0;`r`n    right: 0;`r`n    bottom: 0;`r`n    background: var(--color-overlay);`r`n    z-index: 9999;`r`n    align-items: center;`r`n    justify-content: center;`r`n}"
$searchNew = ".search-overlay {`r`n    display: none;`r`n    position: fixed;`r`n    top: 0;`r`n    left: 0;`r`n    right: 0;`r`n    bottom: 0;`r`n    background: var(--color-overlay);`r`n    z-index: 9999;`r`n    align-items: center;`r`n    justify-content: center;`r`n    pointer-events: none;`r`n}`r`n.search-overlay.active {`r`n    pointer-events: auto;`r`n}"

if ($c.Contains($searchOld)) {
    $c = $c.Replace($searchOld, $searchNew)
    Write-Host "Fixed search-overlay"
} else {
    $searchOldLF = $searchOld.Replace("`r`n","`n")
    $searchNewLF = $searchNew.Replace("`r`n","`n")
    if ($c.Contains($searchOldLF)) {
        $c = $c.Replace($searchOldLF, $searchNewLF)
        Write-Host "Fixed search-overlay (LF)"
    } else {
        Write-Host "search-overlay not found (may already have display:none which is OK)"
    }
}

Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
Write-Host "Done"
