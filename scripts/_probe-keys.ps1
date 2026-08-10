foreach ($k in 'GROQ_API_KEY','GEMINI_API_KEY','NVIDIA_API_KEY','OPENROUTER_API_KEY') {
  $proc = [Environment]::GetEnvironmentVariable($k, 'Process')
  $user = [Environment]::GetEnvironmentVariable($k, 'User')
  if ($user)      { $set = 'USER-SET' }
  elseif ($proc)  { $set = 'PROC-SET' }
  else            { $set = 'UNSET' }
  Write-Output ($k + ': ' + $set)
}
