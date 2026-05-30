param()
$f = 'C:\Users\maila\Desktop\dashboard\finance.html'
$bytes   = [System.IO.File]::ReadAllBytes($f)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

# ── 1) Add missing })(); to close the IIFE ───────────────────────────────────
$crlf = "$([char]13)$([char]10)"
$iifeSuffix = "$([char]13)$([char]10)</script>"
$iifeFix = "$([char]13)$([char]10)$([char]13)$([char]10)" + "})();" + "$([char]13)$([char]10)</script>"

$searchStr = "  ingRenderStatus();" + $iifeSuffix
$replaceStr = "  ingRenderStatus();" + $iifeFix

if ($content.Contains($searchStr)) {
    $content = $content.Replace($searchStr, $replaceStr)
    Write-Host "IIFE close added"
} else {
    Write-Host "IIFE close anchor not found - searching for plain version..."
    # Try with just LF
    $searchStr2 = "  ingRenderStatus();" + "$([char]10)</script>"
    Write-Host "LF version found: $($content.Contains($searchStr2))"
}

# ── 2) Fix all mojibake ───────────────────────────────────────────────────────
# These are UTF-8 codepoints that were incorrectly decoded as Latin-1 and then
# re-encoded as UTF-8, producing 3-byte garbage per original 2-3 byte sequence.
# Strategy: decode the mojibake string back by treating the content chars as
# Latin-1 bytes and re-decoding as UTF-8.

# Actually the most robust approach: find any sequence that when the unicode chars
# are treated as Latin-1 bytes and decoded as UTF-8 gives valid text.
# For simplicity, do targeted replacements for the known patterns.

function FixMojibake($str, $latin1Bytes, $correctChar) {
    $latin1 = [System.Text.Encoding]::GetEncoding(1252)
    $mojibake = $latin1.GetString([byte[]]$latin1Bytes)
    $count = ($str.Split($mojibake).Length - 1)
    if ($count -gt 0) {
        $str = $str.Replace($mojibake, $correctChar)
        Write-Host "Fixed $count x U+$($([int][char[]]$correctChar[0]).ToString('X4')) '$correctChar'"
    }
    return $str
}

# Em dash U+2014, UTF-8: E2 80 94 -> misencoded as C3 A2 C2 80 C2 94 in Latin-1 view
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0x94) ([System.Char]::ConvertFromUtf32(0x2014))
# En dash U+2013: E2 80 93
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0x93) ([System.Char]::ConvertFromUtf32(0x2013))
# Left double quote U+201C: E2 80 9C
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0x9C) ([System.Char]::ConvertFromUtf32(0x201C))
# Right double quote U+201D: E2 80 9D
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0x9D) ([System.Char]::ConvertFromUtf32(0x201D))
# Bullet U+2022: E2 80 A2
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0xA2) ([System.Char]::ConvertFromUtf32(0x2022))
# Ellipsis U+2026: E2 80 A6
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x80,0xC2,0xA6) ([System.Char]::ConvertFromUtf32(0x2026))
# Lightning U+26A1: E2 9A A1
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x9A,0xC2,0xA1) ([System.Char]::ConvertFromUtf32(0x26A1))
# Arrow right U+2192: E2 86 92
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x86,0xC2,0x92) ([System.Char]::ConvertFromUtf32(0x2192))
# Arrow up U+2191: E2 86 91
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x86,0xC2,0x91) ([System.Char]::ConvertFromUtf32(0x2191))
# Arrow down U+2193: E2 86 93
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x86,0xC2,0x93) ([System.Char]::ConvertFromUtf32(0x2193))
# Refresh U+21BB: E2 86 BB
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x86,0xC2,0xBB) ([System.Char]::ConvertFromUtf32(0x21BB))
# Middle dot U+00B7: C2 B7
$content = FixMojibake $content @(0xC3,0x82,0xC2,0xB7) ([System.Char]::ConvertFromUtf32(0x00B7))
# Multiply U+00D7: C3 97 (only 2 bytes of mojibake)
$content = FixMojibake $content @(0xC3,0x97) ([System.Char]::ConvertFromUtf32(0x00D7))
# Check mark U+2713: E2 9C 93
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x9C,0xC2,0x93) ([System.Char]::ConvertFromUtf32(0x2713))
# Warning U+26A0: E2 9A A0
$content = FixMojibake $content @(0xC3,0xA2,0xC2,0x9A,0xC2,0xA0) ([System.Char]::ConvertFromUtf32(0x26A0))
# Copyright U+00A9: C2 A9
$content = FixMojibake $content @(0xC3,0x82,0xC2,0xA9) ([System.Char]::ConvertFromUtf32(0x00A9))
# Registered U+00AE: C2 AE
$content = FixMojibake $content @(0xC3,0x82,0xC2,0xAE) ([System.Char]::ConvertFromUtf32(0x00AE))
# Non-breaking space U+00A0: C2 A0
$content = FixMojibake $content @(0xC3,0x82,0xC2,0xA0) " "
# Zero-width space variants - some section title glyphs
# ⚡ might also appear as Ã¢ÂšÂ¡ which is C3 A2 C2 9A C2 A1 - already covered above

$remaining = ([regex]::Matches($content, [char]0xC3)).Count
Write-Host "Remaining Ã (0xC3) occurrences: $remaining"

# Show samples of remaining if any
if ($remaining -gt 0) {
    $idx = $content.IndexOf([char]0xC3)
    Write-Host "Sample at $idx`: " $content.Substring([Math]::Max(0,$idx-10), 40)
}

[System.IO.File]::WriteAllBytes($f, [System.Text.Encoding]::UTF8.GetBytes($content))
Write-Host "Saved - length: $($content.Length)"
