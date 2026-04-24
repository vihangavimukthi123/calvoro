$file = "index.html"
$c = Get-Content $file -Raw

$old = "                    var scrollAmount = 0;`r`n                    var cardWidth = 300;`r`n                    if (prev && next) {`r`n                        next.onclick = function() {`r`n                            var maxScroll = row.scrollWidth - row.clientWidth;`r`n                            scrollAmount = Math.min(scrollAmount + cardWidth, maxScroll);`r`n                            row.style.transform = 'translateX(-' + scrollAmount + 'px)';`r`n                        };`r`n                        prev.onclick = function() {`r`n                            scrollAmount = Math.max(scrollAmount - cardWidth, 0);`r`n                            row.style.transform = 'translateX(-' + scrollAmount + 'px)';`r`n                        };`r`n                    }"

$new = "                    if (prev && next) {`r`n                        var viewport = row.parentElement;`r`n                        var cardStep = 184;`r`n                        next.onclick = function() {`r`n                            viewport.scrollBy({ left: cardStep, behavior: 'smooth' });`r`n                        };`r`n                        prev.onclick = function() {`r`n                            viewport.scrollBy({ left: -cardStep, behavior: 'smooth' });`r`n                        };`r`n                        function updateTrendingArrows() {`r`n                            prev.disabled = viewport.scrollLeft <= 2;`r`n                            next.disabled = viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2;`r`n                        }`r`n                        viewport.addEventListener('scroll', updateTrendingArrows, { passive: true });`r`n                        updateTrendingArrows();`r`n                    }"

if ($c.Contains($old.Replace("`r`n","`r`n"))) {
    $c = $c.Replace($old, $new)
    Set-Content $file $c -NoNewline -Encoding UTF8
    Write-Host "Arrow JS fixed"
} else {
    Write-Host "NOT FOUND - checking..."
    # Try with LF only
    $old2 = $old.Replace("`r`n", "`n")
    if ($c.Contains($old2)) {
        $c = $c.Replace($old2, $new.Replace("`r`n","`n"))
        Set-Content $file $c -NoNewline -Encoding UTF8
        Write-Host "Fixed with LF"
    } else {
        Write-Host "Still not found, writing debug"
        $c.Substring(($c.IndexOf("var scrollAmount")-5),400) | Write-Host
    }
}
