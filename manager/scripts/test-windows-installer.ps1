# Disposable GitHub runner only; never use this against a practice installation.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Installer test is restricted to a disposable Windows CI runner.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$installDirectory = Join-Path $env:RUNNER_TEMP 'Praxis Manager Test'
$dataDirectory = Join-Path $env:LOCALAPPDATA 'PraxisFlow'
if ((Test-Path $installDirectory) -or (Test-Path $dataDirectory)) {
  throw 'Refusing installer test: test install or data directory already exists.'
}
$installer = @(Get-ChildItem (Join-Path $repo 'manager/dist/*-windows-x64-setup.exe'))
if ($installer.Count -ne 1) { throw 'Expected exactly one x64 installer.' }
New-Item -ItemType Directory $dataDirectory | Out-Null
$marker = Join-Path $dataDirectory 'ci-preserve.txt'
Set-Content -Path $marker -Value 'preserve-on-uninstall' -Encoding utf8
$executable = Join-Path $installDirectory 'PraxisFlowManager.exe'
for ($attempt = 0; $attempt -lt 2; $attempt++) {
  # NSIS /D must be the final argument, without quoting the path itself.
  $process = Start-Process -FilePath $installer[0].FullName -ArgumentList @('/S', '/currentuser', "/D=$installDirectory") -Wait -PassThru
  if ($process.ExitCode -ne 0 -or !(Test-Path $executable)) { throw 'NSIS installation failed.' }
  if ((Get-Content $marker).Trim() -ne 'preserve-on-uninstall') { throw 'Installer modified practice data.' }
}
& node (Join-Path $repo 'manager/scripts/smoke-packaged-setup.mjs') $executable (Join-Path $installDirectory 'resources')
if ($LASTEXITCODE -ne 0) { throw 'Installed Electron setup smoke failed.' }
$uninstaller = @(Get-ChildItem (Join-Path $installDirectory '*Uninstall*.exe'))
if ($uninstaller.Count -ne 1) { throw 'Expected exactly one uninstaller.' }
$process = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList @('/S', '/currentuser') -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'NSIS uninstall failed.' }
for ($attempt = 0; $attempt -lt 50 -and (Test-Path $executable); $attempt++) { Start-Sleep -Milliseconds 200 }
if (Test-Path $executable) { throw 'Application still installed after uninstall.' }
if ((Get-Content $marker).Trim() -ne 'preserve-on-uninstall') { throw 'Uninstall removed practice data.' }
Write-Output 'NSIS install/reinstall/uninstall and data preservation passed (disposable CI account).'
