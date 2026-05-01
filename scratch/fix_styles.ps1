$path = "d:\calvorooooo\css\styles.css"
$content = Get-Content $path
$start = -1
$end = -1
for ($i=0; $i -lt $content.Length; $i++) {
    if ($content[$i] -match "\.logo a \{") { $start = $i }
    if ($start -ne -1 -and $content[$i] -match "opacity: 0\.6;") { $end = $i; break }
}

if ($start -ne -1 -and $end -ne -1) {
    $head = $content[0..($start-1)]
    $tail = $content[($end+2)..$content.Length] # +2 to skip the closing brace of the previous mess
    $mid = @(
        ".logo a {",
        "    display: flex;",
        "    align-items: center;",
        "    height: 100%;",
        "    line-height: 1;",
        "    color: var(--color-text);",
        "    text-decoration: none;",
        "    font-size: 55px;",
        "    font-weight: 900;",
        "    letter-spacing: 3px;",
        "    text-transform: uppercase;",
        "}",
        "",
        "/* Logo: theme-aware (light = black logo, dark = white via invert) */",
        ".logo img {",
        "    height: 100%;",
        "    max-height: 40px;",
        "    width: auto;",
        "    display: block;",
        "    object-fit: contain;",
        "    filter: var(--color-logo-filter) !important;",
        "    transition: var(--transition-theme);",
        "}",
        "",
        ".header nav {",
        "    display: flex;",
        "    gap: 36px;",
        "}",
        "",
        ".header nav a {",
        "    color: var(--color-text);",
        "    text-decoration: none;",
        "    font-size: 12px;",
        "    font-weight: 600;",
        "    text-transform: uppercase;",
        "    letter-spacing: 0.5px;",
        "    transition: opacity 0.2s;",
        "}",
        "",
        ".header nav a:hover,",
        ".header nav a.active {",
        "    opacity: 0.6;",
        "}"
    )
    $newContent = $head + $mid + $tail
    $newContent | Set-Content $path -Encoding UTF8
    Write-Host "Restored styles.css successfully."
} else {
    Write-Host "Could not find target range."
}
