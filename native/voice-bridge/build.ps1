param([switch]$TestBuild,[string]$OutputDirectory='build/voice-bridge')
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output=[IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
if(!$output.StartsWith($repoRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Output must stay inside the checkout'}
New-Item -ItemType Directory -Path $output -Force | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'Windows .NET Framework C# compiler is required'}
$suffix=if($TestBuild){'-test'}else{''}
$hostFile=Join-Path $output "VoiceBridge$suffix.exe"
$setupFile=Join-Path $output "VoiceBridgeSetup$suffix.exe"
$shared=@('/nologo','/target:exe','/platform:anycpu','/optimize+','/reference:System.Web.Extensions.dll')
if($TestBuild){$shared+='/define:VOICE_BRIDGE_TEST'}
& $compiler @shared '/reference:System.Net.Http.dll' "/out:$hostFile" (Join-Path $PSScriptRoot 'VoiceBridge.cs')
if($LASTEXITCODE -ne 0){throw 'Host compilation failed'}
& $compiler @shared "/resource:$hostFile,VoiceBridge.exe" "/out:$setupFile" (Join-Path $PSScriptRoot 'VoiceBridgeSetup.cs')
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
$files=@('VoiceBridge.cs','VoiceBridgeSetup.cs','build.ps1') | ForEach-Object {Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot $_) | Select-Object Path,Hash}
@{protocol=1;testBuild=[bool]$TestBuild;compiler=$compiler;sourceHashes=$files;binaryHashes=@(Get-FileHash -Algorithm SHA256 -LiteralPath $hostFile,$setupFile | Select-Object Path,Hash)} | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $output "build$suffix.json")
Write-Output "Built $setupFile (unsigned verification candidate)"
