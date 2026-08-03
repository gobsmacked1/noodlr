# Package Noodlr for a GitHub release: validate, clean-build, zip, then verify the zip.
#
# Run from the repo root as `npm run package`. Releases are always cut from the Windows workstation,
# so this is PowerShell rather than a Node script needing a zip dependency.
#
# It exists because two packaging faults shipped in a row (2026-08-03): a release created with no assets
# at all — which Foundry reports as "No module manifest found", and which BLOCKS updating because the
# manifest URL resolves to releases/latest — and, before that, an asset missing models/, which only
# breaks for people installing by manifest and so cannot be noticed from a dev install. Both are now
# assertions rather than things to remember.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Fail([string]$message) {
  Write-Host "FAIL: $message" -ForegroundColor Red
  exit 1
}

# --- versions must agree, and the download URL must point at the tag we are about to cut ------------
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$mod = Get-Content module.json -Raw | ConvertFrom-Json
$version = $mod.version
if ($pkg.version -ne $version) {
  Fail "package.json ($($pkg.version)) and module.json ($version) disagree on the version"
}
if ($mod.download -notlike "*v$version/module.zip") {
  Fail "module.json download URL does not point at v$version : $($mod.download)"
}

# --- validate and build fresh ----------------------------------------------------------------------
npm run check
if ($LASTEXITCODE) { Fail "tsc reported errors" }
npm run lint
if ($LASTEXITCODE) { Fail "eslint reported errors" }
npm run build
if ($LASTEXITCODE) { Fail "build failed" }

# --- every chunk the bundles import must exist -----------------------------------------------------
# The build wipes dist/, so a chunk that failed to emit is now a hard 404 at runtime instead of being
# masked by an identically-named file left over from an earlier build.
#
# Only esbuild's own content-hashed names are checked (`chunk-ABCD1234.js`, `embedder-ABCD1234.js`).
# Bundled libraries carry plain relative paths like "./maths.js" in ordinary string literals, which are
# not imports and do not exist as files — matching every "./*.js" reported 11 of those as failures.
$dangling = @()
$hashed = '["'']\./((?:[A-Za-z0-9._]+-)?[A-Z0-9]{8}\.m?js|chunk-[A-Z0-9]{8}\.m?js)["'']'
foreach ($file in Get-ChildItem dist -Filter *.js -Recurse) {
  $text = Get-Content $file.FullName -Raw
  foreach ($m in [regex]::Matches($text, $hashed)) {
    $target = Join-Path $file.DirectoryName $m.Groups[1].Value
    if (-not (Test-Path $target)) { $dangling += "$($file.Name) -> $($m.Groups[1].Value)" }
  }
}
if ($dangling.Count) { Fail ("dangling chunk references:`n  " + ($dangling -join "`n  ")) }

# --- the payload -----------------------------------------------------------------------------------
# models/ is NOT optional: rag/local/embedder.ts sets allowRemoteModels = false and reads
# localModelPath from modules/noodlr/models/, so Memory Lite has no remote fallback.
$weights = "models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx"
$paths = @(
  "banter", "dist", "lang", "models", "prompts", "styles", "templates",
  "changelog.md", "LICENSE", "module.json", "README.md"
)
foreach ($p in $paths) {
  if (-not (Test-Path $p)) { Fail "missing from the working tree: $p" }
}
if (-not (Test-Path $weights)) { Fail "$weights is missing - run npm run fetch-model" }

Remove-Item module.zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $paths -DestinationPath module.zip -CompressionLevel Optimal

# --- verify the archive itself, not the intent ------------------------------------------------------
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path module.zip))
try {
  $required = @(
    "module.json", "dist/noodlr.js", "dist/ort/ort-wasm-simd-threaded.asyncify.wasm",
    "lang/en.json", "styles/noodlr.css", "banter/banter.txt", "templates/partials/", $weights
  )
  foreach ($r in $required) {
    if (-not ($zip.Entries | Where-Object { $_.FullName -like "$r*" })) { Fail "zip is missing $r" }
  }
  $entries = $zip.Entries.Count
}
finally {
  $zip.Dispose()
}

$mb = [math]::Round((Get-Item module.zip).Length / 1MB, 2)
Write-Host ""
Write-Host "packaged v$version - module.zip, $entries entries, $mb MB" -ForegroundColor Green
Write-Host "next:"
Write-Host "  git add -A; git commit; git tag -a v$version; git push origin HEAD --tags"
Write-Host "  gh release create v$version module.zip module.json --title ... --notes-file ..."
Write-Host "  gh release view v$version --json assets   # must list BOTH module.json and module.zip"
