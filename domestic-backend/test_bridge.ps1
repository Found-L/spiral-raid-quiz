param(
    [string]$OldApi = 'https://spiral-raid-quiz-api.foundliny.chatgpt.site',
    [string]$NewApi = 'https://www.lysue.com/spiral-raid-quiz'
)

$ErrorActionPreference = 'Stop'
$bank = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'questions.json') -Raw -Encoding UTF8 | ConvertFrom-Json
function New-TestHex([int]$length) {
    [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes($length)).ToLowerInvariant()
}
function Invoke-QuizPost([string]$base, [string]$path, [object]$payload) {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -Method Post -Uri ($base + $path) `
        -Headers @{ Origin = 'https://found-l.github.io' } -ContentType 'application/json; charset=utf-8' `
        -Body ($payload | ConvertTo-Json -Depth 20 -Compress)
    if ($response.Headers['Access-Control-Allow-Origin'] -ne 'https://found-l.github.io') {
        throw 'Missing GitHub origin in CORS response.'
    }
    return ($response.Content | ConvertFrom-Json)
}

$device = New-TestHex 16
$secret = New-TestHex 32
$testName = '连接测试-' + (New-TestHex 5)
$identity = @{ deviceId = $device; secret = $secret }
$created = $false
try {
    $profile = Invoke-QuizPost $OldApi '/api/profile' @{ deviceId = $device; secret = $secret; nickname = $testName }
    $created = $true
    if (-not $profile.playerNumber) { throw 'Old endpoint did not create a numbered profile.' }
    $answers = @{}
    foreach ($q in $bank.questions) { $answers[$q.id] = @($q.answer) }
    $result = Invoke-QuizPost $NewApi '/api/submit' @{
        deviceId = $device; secret = $secret; version = $bank.version
        attemptId = (New-TestHex 16); answers = $answers
    }
    if ($result.score -ne 100 -or $result.correctCount -ne $bank.questions.Count) {
        throw 'The new endpoint did not score the submitted answers correctly.'
    }
    $history = Invoke-QuizPost $OldApi '/api/history' $identity
    if ($history.attemptCount -ne 1 -or $history.bestScore -ne 100) {
        throw 'The old endpoint did not return the score saved through the new endpoint.'
    }
    Write-Output 'PASS old endpoint profile, new endpoint scoring, old endpoint history, shared identity and CORS.'
}
finally {
    if ($created) {
        $deleted = Invoke-QuizPost $NewApi '/api/delete-profile' $identity
        if (-not $deleted.ok) { throw 'Test profile cleanup failed.' }
    }
}
