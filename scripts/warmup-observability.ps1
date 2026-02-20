param(
  [string]$BaseUrl = "https://control-finance-react-tailwind.onrender.com",
  [int]$TransactionsCount = 5,
  [int]$DelayMs = 300,
  [switch]$Generate4xx
)

$ErrorActionPreference = "Stop"

if ($TransactionsCount -le 0) {
  Write-Host "[FAIL] TransactionsCount must be greater than zero."
  exit 1
}

if ($DelayMs -lt 0) {
  Write-Host "[FAIL] DelayMs must be zero or greater."
  exit 1
}

$runId = [guid]::NewGuid().ToString("N")
$runSuffix = $runId.Substring(0, 8)
$requestPrefix = "warmup-$runSuffix"
$email = "warmup+$runSuffix@controlfinance.dev"
$password = "Warmup!$runSuffix"
$today = Get-Date

Write-Host "=== Observability Warmup ==="
Write-Host "BaseUrl: $BaseUrl"
Write-Host "RunId: $runId"
Write-Host "Email: $email"
Write-Host ""

function Assert-Status {
  param($Response, $ExpectedStatus, $Step)

  if ($null -eq $Response) {
    Write-Host "[FAIL] $Step failed. Empty response."
    exit 1
  }

  if ([int]$Response.StatusCode -ne [int]$ExpectedStatus) {
    Write-Host "[FAIL] $Step failed. Expected $ExpectedStatus, got $($Response.StatusCode)."
    Write-Host $Response.Content
    exit 1
  }
}

function Invoke-Json {
  param($Method, $Url, $Headers, $Body)

  if ($null -eq $Body) {
    return Invoke-WebRequest `
      -Method $Method `
      -Uri $Url `
      -Headers $Headers `
      -ContentType "application/json" `
      -UseBasicParsing
  }

  return Invoke-WebRequest `
    -Method $Method `
    -Uri $Url `
    -Headers $Headers `
    -Body $Body `
    -ContentType "application/json" `
    -UseBasicParsing
}

# 1) Health
$healthRequestId = "$requestPrefix-health"
Write-Host "1) GET /health"
$healthResponse = Invoke-Json "GET" "$BaseUrl/health" @{ "x-request-id" = $healthRequestId } $null
Assert-Status $healthResponse 200 "Health"

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

# 2) Register ephemeral user
$registerRequestId = "$requestPrefix-register"
Write-Host "2) POST /auth/register"
$registerHeaders = @{
  "Content-Type" = "application/json"
  "x-request-id" = $registerRequestId
}
$registerBody = @{
  email = $email
  password = $password
} | ConvertTo-Json

$registerResponse = Invoke-Json "POST" "$BaseUrl/auth/register" $registerHeaders $registerBody
Assert-Status $registerResponse 201 "Register"

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

# 3) Login
$loginRequestId = "$requestPrefix-login"
Write-Host "3) POST /auth/login"
$loginHeaders = @{
  "Content-Type" = "application/json"
  "x-request-id" = $loginRequestId
}
$loginBody = @{
  email = $email
  password = $password
} | ConvertTo-Json

$loginResponse = Invoke-Json "POST" "$BaseUrl/auth/login" $loginHeaders $loginBody
Assert-Status $loginResponse 200 "Login"

$loginPayload = $loginResponse.Content | ConvertFrom-Json
$token = $loginPayload.token
if (-not $token) { $token = $loginPayload.accessToken }

if (-not $token) {
  Write-Host "[FAIL] Token not found in login response."
  exit 1
}

$authHeaders = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
}

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

# 4) Optional category write to warm category route
$categoryRequestId = "$requestPrefix-category"
Write-Host "4) POST /categories"
$categoryHeaders = $authHeaders.Clone()
$categoryHeaders["x-request-id"] = $categoryRequestId
$categoryBody = @{
  name = "Warmup $runSuffix"
} | ConvertTo-Json

$categoryResponse = Invoke-Json "POST" "$BaseUrl/categories" $categoryHeaders $categoryBody
Assert-Status $categoryResponse 201 "Create category"

if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }

# 5) Create transactions
Write-Host "5) POST /transactions x$TransactionsCount"
for ($index = 1; $index -le $TransactionsCount; $index += 1) {
  $txRequestId = "$requestPrefix-tx-$index"
  $txHeaders = $authHeaders.Clone()
  $txHeaders["x-request-id"] = $txRequestId
  $txDate = $today.AddDays(-$index).ToString("yyyy-MM-dd")
  $txBody = @{
    type = "Entrada"
    value = (Get-Random -Minimum 50 -Maximum 500)
    date = $txDate
    description = "Warmup transaction $index"
  } | ConvertTo-Json

  $txResponse = Invoke-Json "POST" "$BaseUrl/transactions" $txHeaders $txBody
  Assert-Status $txResponse 201 "Create transaction #$index"

  if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
}

# 6) Optional 4xx sample
if ($Generate4xx) {
  Write-Host "6) Optional invalid request (expect 4xx)"
  $invalidRequestId = "$requestPrefix-invalid"
  $invalidHeaders = $authHeaders.Clone()
  $invalidHeaders["x-request-id"] = $invalidRequestId
  $invalidBody = @{
    type = "Entrada"
  } | ConvertTo-Json

  $invalidStatus = $null

  try {
    $invalidResponse = Invoke-WebRequest `
      -Method POST `
      -Uri "$BaseUrl/transactions" `
      -Headers $invalidHeaders `
      -Body $invalidBody `
      -ContentType "application/json" `
      -UseBasicParsing

    $invalidStatus = [int]$invalidResponse.StatusCode
  } catch {
    if ($null -ne $_.Exception.Response) {
      $invalidStatus = [int]$_.Exception.Response.StatusCode
    } else {
      throw
    }
  }

  if ($invalidStatus -lt 400 -or $invalidStatus -ge 500) {
    Write-Host "[FAIL] Expected 4xx for invalid request, got $invalidStatus."
    exit 1
  }
}

# 7) Warm read endpoint
$listRequestId = "$requestPrefix-list"
Write-Host "7) GET /transactions"
$listHeaders = $authHeaders.Clone()
$listHeaders["x-request-id"] = $listRequestId
$listResponse = Invoke-Json "GET" "$BaseUrl/transactions" $listHeaders $null
Assert-Status $listResponse 200 "List transactions"

Write-Host ""
Write-Host "[PASS] Warmup completed."
Write-Host "Run this query in Grafana Explore:"
Write-Host 'sum(rate(http_requests_total{job="control-finance-api"}[5m]))'
