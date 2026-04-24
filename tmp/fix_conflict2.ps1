$c = Get-Content 'css\styles.css' -Raw

# Remove the conflicting old trending-slider mobile block (the one that hides slider-arrow)
$toRemove = "@media (max-width: 768px) {`r`n    .trending-slider-container {`r`n        padding: 0 20px;`r`n    }`r`n    .products-row-nowrap {`r`n        gap: 16px;`r`n        overflow-x: auto;`r`n        -webkit-overflow-scrolling: touch;`r`n        scroll-snap-type: x mandatory;`r`n        scrollbar-width: none;`r`n    }`r`n    .products-row-nowrap::-webkit-scrollbar { display: none; }`r`n    .products-row-nowrap .card {`r`n        flex: 0 0 220px;`r`n        scroll-snap-align: center;`r`n    }`r`n    .slider-arrow { display: none; } /* Use native scroll on mobile */`r`n}"

if ($c.Contains($toRemove)) {
    $c = $c.Replace($toRemove, "")
    Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
    Write-Host "Removed conflicting block. Lines: $($c.Split("`n").Count)"
} else {
    Write-Host "Not found - checking with LF..."
    $toRemoveLF = $toRemove.Replace("`r`n","`n")
    if ($c.Contains($toRemoveLF)) {
        $c = $c.Replace($toRemoveLF, "")
        Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
        Write-Host "Removed LF version. Lines: $($c.Split("`n").Count)"
    } else {
        # Manual approach: find line with 'slider-arrow { display: none; } /* Use native scroll on mobile */'
        $lines = $c.Split("`n")
        $start = -1
        $end = -1
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i].Trim() -eq '.trending-slider-container {' -and $start -lt 0) {
                # Find the @media before this
                for ($j = $i; $j -ge 0; $j--) {
                    if ($lines[$j].Contains('@media (max-width: 768px)')) {
                        $start = $j
                        break
                    }
                }
            }
            if ($start -ge 0 -and $lines[$i].Contains('Use native scroll on mobile')) {
                $end = $i + 1  # include closing }
                break
            }
        }
        if ($start -ge 0 -and $end -ge 0) {
            $newLines = [System.Collections.Generic.List[string]]::new()
            for ($i = 0; $i -lt $lines.Count; $i++) {
                if ($i -lt $start -or $i -gt $end) {
                    $newLines.Add($lines[$i])
                }
            }
            $c = $newLines -join "`n"
            Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
            Write-Host "Removed via line scan ($start to $end). Lines: $($c.Split("`n").Count)"
        } else {
            Write-Host "Could not locate block. start=$start end=$end"
        }
    }
}
