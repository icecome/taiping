$root = 'C:\opt\workstations\project\blogs\taiping_blog'
$log = Join-Path $env:TEMP 'taiping-edge.out.log'
$err = Join-Path $env:TEMP 'taiping-edge.err.log'
$cmd = 'cmd.exe /c cd /d "' + $root + '" && pnpm -F @taiping/edge dev > "' + $log + '" 2> "' + $err + '"'
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
Write-Output ("PID=" + $result.ProcessId + " RET=" + $result.ReturnValue)
