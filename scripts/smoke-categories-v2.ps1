param(
  [string]$BaseUrl = "https://BASE_URL",
  [string]$Email = "smoke-category@controlfinance.dev",
  [string]$Password = "12345678"
)

$ErrorActionPreference = "Stop"
$RequestId = [guid]::NewGuid().ToString()
$CategorySuffix = $RequestId.Substring(0, 8)
$CategoryName = "SmokeTest-$CategorySuffix"

Write-Host "=== Smoke Test Categories v2 ==="
Write-Host "RequestId: $RequestId"
Write-Host "BaseUrl: $BaseUrl"
Write-Host ""

function Assert-Status {
  param($Response, $ExpectedStatus, $Step)

  if ($null -eq $Response) {
    Write-Host "[FAIL] $Step failed. Empty response"
    exit 1
  }

  if ($Response.StatusCode -ne $ExpectedStatus) {
    Write-Host "[FAIL] $Step failed. Expected $ExpectedStatus, got $($Response.StatusCode)"
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

$headers = @{
  "Content-Type" = "application/json"
  "x-request-id" = $RequestId
}

# 1) Login
Write-Host "1) Login..."
$loginResponse = Invoke-Json "POST" "$BaseUrl/auth/login" $headers "{`"email`":`"$Email`",`"password`":`"$Password`"}"
Assert-Status $loginResponse 200 "Login"

$loginBody = $loginResponse.Content | ConvertFrom-Json
$token = $loginBody.token
if (-not $token) { $token = $loginBody.accessToken }

if (-not $token) {
  Write-Host "[FAIL] Token not found in login response"
  exit 1
}

$authHeaders = @{
  "Authorization" = "Bearer $token"
  "Content-Type" = "application/json"
  "x-request-id" = $RequestId
}

# 2) Create category
Write-Host "2) Create category..."
$categoryResponse = Invoke-Json "POST" "$BaseUrl/categories" $authHeaders "{`"name`":`"$CategoryName`"}"
Assert-Status $categoryResponse 201 "Create category"

$category = $categoryResponse.Content | ConvertFrom-Json
$categoryId = [int]$category.id

# 3) Create transaction
Write-Host "3) Create transaction..."
$transactionResponse = Invoke-Json "POST" "$BaseUrl/transactions" $authHeaders "{`"type`":`"Saida`",`"value`":100,`"date`":`"2026-02-20`",`"description`":`"Smoke Tx`",`"category_id`":$categoryId}"
Assert-Status $transactionResponse 201 "Create transaction"

$transaction = $transactionResponse.Content | ConvertFrom-Json
$transactionId = [int]$transaction.id

if ($transaction.categoryId -ne $categoryId) {
  Write-Host "[FAIL] Transaction did not persist initial category id"
  exit 1
}

# 4) Delete category
Write-Host "4) Delete category..."
$deleteResponse = Invoke-Json "DELETE" "$BaseUrl/categories/$categoryId" $authHeaders $null
Assert-Status $deleteResponse 200 "Delete category"

# 5) PATCH transaction -> category_id null
Write-Host "5) Patch transaction to null..."
$patchResponse = Invoke-Json "PATCH" "$BaseUrl/transactions/$transactionId" $authHeaders "{`"category_id`":null}"
Assert-Status $patchResponse 200 "Patch category_id null"

$patched = $patchResponse.Content | ConvertFrom-Json
if ($patched.categoryId -ne $null) {
  Write-Host "[FAIL] categoryId was not persisted as null"
  exit 1
}

# 6) Confirm persistence
Write-Host "6) Confirm persistence..."
$listResponse = Invoke-Json "GET" "$BaseUrl/transactions" $authHeaders $null
Assert-Status $listResponse 200 "List transactions"

$list = $listResponse.Content | ConvertFrom-Json
$target = $list.data | Where-Object { $_.id -eq $transactionId } | Select-Object -First 1

if ($null -eq $target) {
  Write-Host "[FAIL] Updated transaction not found in list response"
  exit 1
}

if ($target.categoryId -ne $null) {
  Write-Host "[FAIL] Persisted categoryId is not null"
  exit 1
}

# 7) Negative test (must return 404)
Write-Host "7) Negative test: update to deleted category..."
$negativeStatus = $null
$negativeBody = ""

try {
  $negativeResponse = Invoke-WebRequest `
    -Method PATCH `
    -Uri "$BaseUrl/transactions/$transactionId" `
    -Headers $authHeaders `
    -Body "{`"category_id`":$categoryId}" `
    -ContentType "application/json" `
    -UseBasicParsing

  $negativeStatus = [int]$negativeResponse.StatusCode
  $negativeBody = $negativeResponse.Content
} catch {
  $webException = $_.Exception

  if ($null -ne $webException.Response) {
    $negativeStatus = [int]$webException.Response.StatusCode

    try {
      $stream = $webException.Response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $negativeBody = $reader.ReadToEnd()
        $reader.Close()
      }
    } catch {
      $negativeBody = ""
    }
  } else {
    throw
  }
}

if ($negativeStatus -ne 404) {
  Write-Host "[FAIL] Expected 404 when updating to deleted category, got $negativeStatus"
  if ($negativeBody) { Write-Host $negativeBody }
  exit 1
}

Write-Host ""
Write-Host "[PASS] Smoke test passed successfully."

