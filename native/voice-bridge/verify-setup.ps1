$ErrorActionPreference='Stop'
$registry='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.kimitolink.voice_bridge_test'
$artifactRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.artifacts/voice-native'))
$installRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('../../.artifacts/vbtest-'+[Guid]::NewGuid().ToString('N').Substring(0,8))))
$setup=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/voice-bridge/setup-candidate/VoiceBridgeSetup-test.exe'))
$old=if(Test-Path -LiteralPath $registry){(Get-Item -LiteralPath $registry).GetValue('')}else{$null}
if($old -and $old -ne (Join-Path $artifactRoot 'native-host-test.json')){throw 'Refusing foreign test registration'}
try {
 if($old){Remove-Item -LiteralPath $registry}
 & $setup --root $installRoot
 if($LASTEXITCODE -ne 0){throw 'Test install failed'}
 $registered=(Get-Item -LiteralPath $registry).GetValue('')
 if($registered -ne (Join-Path $installRoot 'host.json')){throw 'Unexpected registration'}
 $manifest=Get-Content -LiteralPath $registered -Raw | ConvertFrom-Json
 if(!$manifest.path.StartsWith($installRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installed executable escaped test root'}
 $installedSetup=Join-Path (Split-Path $manifest.path) 'VoiceBridgeSetup.exe'
 & $installedSetup --root $installRoot --uninstall
 if($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $registry)){throw 'Installed setup did not unregister'}
 & $setup --root $installRoot
 if($LASTEXITCODE -ne 0){throw 'Reinstall after uninstall failed'}
 & $setup --root $installRoot
 if($LASTEXITCODE -ne 0){throw 'Idempotent reinstall failed'}
 & $setup --root $installRoot --uninstall
 if($LASTEXITCODE -ne 0){throw 'External cleanup failed'}
 if(Test-Path -LiteralPath $installRoot){throw 'Known installed files remained after external cleanup'}
 # Recover a process interrupted while the very first ownership marker was staged.
 New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
 [IO.File]::WriteAllText((Join-Path $installRoot '.vb-aabbccdd'),'KimitoLink', [Text.UTF8Encoding]::new($false))
 & $setup --root $installRoot
 if($LASTEXITCODE -ne 0){throw 'Interrupted first-marker recovery failed'}
 & $setup --root $installRoot --uninstall
 if($LASTEXITCODE -ne 0){throw 'Recovered install did not unregister'}
 if([IO.File]::ReadAllText((Join-Path $installRoot '.vb-aabbccdd')) -ne 'KimitoLink'){throw 'Staged file unexpectedly changed'}
 # An unrelated registration must survive an install attempt.
 New-Item -Path $registry -Force | Out-Null
 Set-Item -LiteralPath $registry -Value (Join-Path $artifactRoot 'foreign.json')
 & $setup --root $installRoot
 if($LASTEXITCODE -eq 0){throw 'Foreign registration was accepted'}
 if((Get-Item -LiteralPath $registry).GetValue('') -ne (Join-Path $artifactRoot 'foreign.json')){throw 'Foreign registration changed'}
 Remove-Item -LiteralPath $registry
 @{ok=$true;testOnly=$true;installRoot=$installRoot;checks=@('per-user-install','installed-uninstaller','reinstall-after-locked-self','idempotent-reinstall','external-cleanup','interrupted-first-marker-recovery','staged-file-preserved','foreign-registration-preserved')} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'setup-verification.json')
 Write-Output 'Native setup verification passed'
}finally {
 if(Test-Path -LiteralPath $registry){
   $current=(Get-Item -LiteralPath $registry).GetValue('')
   if($current -eq (Join-Path $installRoot 'host.json') -or $current -eq (Join-Path $artifactRoot 'foreign.json')){Remove-Item -LiteralPath $registry}else{throw 'Unexpected registry owner during cleanup'}
 }
 if($old){New-Item -Path $registry -Force | Out-Null;Set-Item -LiteralPath $registry -Value $old}
}
$global:LASTEXITCODE=0
