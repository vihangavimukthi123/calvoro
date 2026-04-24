$c = Get-Content 'css\styles.css' -Raw

# Prepend the global touch safety rules right after the @import line
$insertAfter = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');"

$globalRules = @"

/* ========== GLOBAL MOBILE TOUCH SAFETY ==========
 * Ensures no invisible overlay can block touch events.
 * aria-hidden="true" elements get pointer-events:none.
 * All interactive elements get tap highlight removed.
 * ================================================= */

/* Hidden elements must NOT block touches */
[aria-hidden="true"] {
    pointer-events: none !important;
}

/* Remove iOS tap flash & enable fast tap on all interactive elements */
a, button, input, select, textarea, label, [role="button"] {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}

"@

if ($c.Contains($insertAfter)) {
    $c = $c.Replace($insertAfter, $insertAfter + $globalRules)
    Set-Content 'css\styles.css' $c -NoNewline -Encoding UTF8
    Write-Host "Prepended global touch safety rules OK"
} else {
    Write-Host "Import line not found"
}
