$c = Get-Content 'css\styles.css' -Raw

# Remove the old conflicting trending mobile block
$old = "@media (max-width: 768px) {`r`n    .slider-arrow {`r`n        display: none;`r`n    }`r`n    .trending-viewport {`r`n        overflow: visible;`r`n    }`r`n    .products-row-nowrap {`r`n        display: grid;`r`n        grid-template-columns: 1fr 1fr;`r`n        gap: 12px;`r`n        width: 100%;`r`n        transform: none !important;`r`n    }`r`n    .products-row-nowrap .card {`r`n        flex: none;`r`n        width: 100%;`r`n    }`r`n}"

# Try LF version
$oldLF = $old.Replace("`r`n", "`n")

if ($c.Contains($old)) {
    $c = $c.Replace($old, "/* trending mobile handled in consolidated @media block below */")
    Write-Host "Replaced CRLF version"
} elseif ($c.Contains($oldLF)) {
    $c = $c.Replace($oldLF, "/* trending mobile handled in consolidated @media block below */")
    Write-Host "Replaced LF version"
} else {
    # Find differently - search for the key pattern
    $pattern = "    .slider-arrow \{`r`n        display: none;`r`n    \}"
    $idx = $c.IndexOf("    .slider-arrow {")
    if ($idx -gt 0) {
        # Find the @media before it
        $before = $c.LastIndexOf("@media", $idx)
        $closing = $c.IndexOf("}`r`n`r`n/* Promo", $idx)
        if ($closing -lt 0) { $closing = $c.IndexOf("}`n`n/* Promo", $idx) }
        if ($closing -gt 0) {
            $toRemove = $c.Substring($before, $closing - $before + 1)
            $c = $c.Remove($before, $closing - $before + 1)
            Write-Host "Removed block at $before to $closing"
        } else {
            Write-Host "Could not find closing. idx=$idx"
        }
    } else {
        Write-Host "slider-arrow display:none not found"
    }
}

Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
Write-Host "Done. Lines: $($c.Split("`n").Count)"
