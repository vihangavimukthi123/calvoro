$c = Get-Content 'css\styles.css' -Raw

$old = "html, body {`r`n    overflow-x: hidden;`r`n    width: 100%;`r`n    position: relative;`r`n}"
$new = "html, body {`r`n    overflow-x: hidden;`r`n    width: 100%;`r`n    position: relative;`r`n    -webkit-overflow-scrolling: touch;`r`n}`r`n`r`n/* Global: hidden elements MUST NOT intercept touch events */`r`n[aria-hidden=""true""] {`r`n    pointer-events: none !important;`r`n}`r`n`r`n/* Remove tap highlight on all interactive elements */`r`na, button, input, select, label, [role=""button""] {`r`n    -webkit-tap-highlight-color: transparent;`r`n    touch-action: manipulation;`r`n}"

if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
    Write-Host "Fixed global touch rules"
} else {
    $oldLF = $old.Replace("`r`n","`n")
    $newLF = $new.Replace("`r`n","`n")
    if ($c.Contains($oldLF)) {
        $c = $c.Replace($oldLF, $newLF)
        Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
        Write-Host "Fixed global touch rules (LF)"
    } else {
        # Try just adding after the first line
        $idx = $c.IndexOf("html, body {")
        $end = $c.IndexOf("}", $idx) + 1
        $orig = $c.Substring($idx, $end - $idx)
        Write-Host "Found block: $($orig.Replace("`r","").Replace("`n"," | "))"
    }
}
