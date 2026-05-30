param()
$f = 'C:\Users\maila\Desktop\dashboard\finance.html'
$bytes   = [System.IO.File]::ReadAllBytes($f)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

$win1252  = [System.Text.Encoding]::GetEncoding(1252)
$latin1   = [System.Text.Encoding]::GetEncoding(28591)
$utf8     = [System.Text.Encoding]::UTF8

function UnDouble($s) {
    # Step 1: str -> win1252 bytes -> utf8 string
    $b1 = $win1252.GetBytes($s)
    $s1 = $utf8.GetString($b1)
    # Step 2: str -> latin1 bytes -> utf8 string (handles control-char range U+0080-U+009F)
    $b2 = $latin1.GetBytes($s1)
    $s2 = $utf8.GetString($b2)
    return $s2
}

# Build list of specific known patterns to fix
# Each entry: what's in file now -> what it should be
$pairs = [System.Collections.Generic.List[object]]::new()

# --- ÃƒÂ— = × (U+00D7, multiply sign used as close button)
$closeIn  = [System.Char]::ConvertFromUtf32(0x00C3) + [System.Char]::ConvertFromUtf32(0x0192) +
            [System.Char]::ConvertFromUtf32(0x00C2) + [System.Char]::ConvertFromUtf32(0x2014)
$closeOut = [System.Char]::ConvertFromUtf32(0x00D7)
$pairs.Add(@{Old=$closeIn; New=$closeOut; Name='x'})

# --- Ã¢Â‰Â¤ = <= (less-than-or-equal, U+2264)
# E2 89 A4 -> double encoded
# step1: E2->0xE2=0xE2 chr â, 89->0x89 in win1252=U+2030 permill, A4->0xA4=U+00A4 currency
# Actually let's just compute it:
$leq = UnDouble ([System.Char]::ConvertFromUtf32(0x00C3) + [System.Char]::ConvertFromUtf32(0x00A2) +
                 [System.Char]::ConvertFromUtf32(0x00C2) + [System.Char]::ConvertFromUtf32(0x2030) +
                 [System.Char]::ConvertFromUtf32(0x00C2) + [System.Char]::ConvertFromUtf32(0x00A4))
Write-Host "leq result: '$leq'"
# If that doesn't give <= directly, use the known answer
if ($leq -eq [System.Char]::ConvertFromUtf32(0x2264)) {
    $leqIn = [System.Char]::ConvertFromUtf32(0x00C3) + [System.Char]::ConvertFromUtf32(0x00A2) +
             [System.Char]::ConvertFromUtf32(0x00C2) + [System.Char]::ConvertFromUtf32(0x2030) +
             [System.Char]::ConvertFromUtf32(0x00C2) + [System.Char]::ConvertFromUtf32(0x00A4)
    $pairs.Add(@{Old=$leqIn; New=$leq; Name='leq'})
}

# --- Find all remaining Ã-prefixed sequences by scanning the file
# Use StringReader approach to find runs that start with Ã or Â
$i = 0
$seen = [System.Collections.Generic.HashSet[string]]::new()
while ($i -lt $content.Length - 2) {
    $c = $content[$i]
    $cp = [int]$c
    # Potential mojibake: starts with Ã (U+00C3) or Â (U+00C2)
    if ($cp -eq 0x00C3 -or $cp -eq 0x00C2) {
        # Collect the run: chars whose codepoints suggest mojibake
        # (Latin-1 range + common Win-1252 extras + our already-fixed special chars)
        $j = $i
        while ($j -lt $content.Length) {
            $ch = [int]$content[$j]
            # Accept: basic Latin (0x20-0x7E), Latin extended (0x80-0x02FF),
            # smart quotes/dashes/arrows we already fixed (U+2013-U+2199),
            # per-mille/others (U+2030-U+2060)
            if ($ch -ge 0x20 -and ($ch -le 0x02FF -or ($ch -ge 0x2013 -and $ch -le 0x2199) -or ($ch -ge 0x2030 -and $ch -le 0x2060))) {
                $j++
            } else { break }
        }
        $seq = $content.Substring($i, $j - $i)
        if ($seq.Length -ge 2 -and -not $seen.Contains($seq)) {
            $seen.Add($seq) | Out-Null
            # Try 2-step decode
            try {
                $decoded = UnDouble $seq
                if ($decoded -ne $seq -and $decoded.Length -lt $seq.Length) {
                    $pairs.Add(@{Old=$seq; New=$decoded; Name=$seq.Substring(0,[Math]::Min(6,$seq.Length))})
                }
            } catch {}
        }
    }
    $i++
}

Write-Host "Replacement pairs found: $($pairs.Count)"

# Apply replacements, longest first to avoid partial overlaps
$sorted = $pairs | Sort-Object { $_.Old.Length } -Descending
$totalFixed = 0
foreach ($p in $sorted) {
    $count = ($content.Length - $content.Replace($p.Old, '').Length) / $p.Old.Length
    if ($count -gt 0) {
        $content = $content.Replace($p.Old, $p.New)
        Write-Host "  Fixed $([int]$count)x [$($p.Name)] '$($p.Old.Substring(0,[Math]::Min(8,$p.Old.Length)))' -> '$($p.New.Substring(0,[Math]::Min(6,$p.New.Length)))'"
        $totalFixed += $count
    }
}
Write-Host "Total fixed: $totalFixed"

$remaining = 0
for ($k = 0; $k -lt $content.Length; $k++) { if ([int]$content[$k] -eq 0x00C3) { $remaining++ } }
Write-Host "Remaining U+00C3 (Ã) chars: $remaining"

[System.IO.File]::WriteAllBytes($f, [System.Text.Encoding]::UTF8.GetBytes($content))
Write-Host "Saved"
