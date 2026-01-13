$env:BASE="https://sandblast-backend.onrender.com"
$h=@{ "Content-Type"="application/json" }

function Post($text){
  $payload = @{ text=$text; sessionId="t_sched"; visitorId="mac-sched"; contractVersion="1" } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$env:BASE/api/chat?debug=1" -Headers $h -Body $payload
}

"1) Enter schedule lane"
Post "Schedule" | Select-Object ok,reply,sessionId | Format-List

"2) Ask: Gospel Sunday in London"
Post "What time does Gospel Sunday play in London?" | Select-Object ok,reply | Format-List

"3) Playing now"
Post "What's playing now?" | Select-Object ok,reply | Format-List

"4) Show me the schedule"
Post "Show me the schedule" | Select-Object ok,reply | Format-List

"5) Back to music"
Post "Back to music" | Select-Object ok,reply | Format-List
