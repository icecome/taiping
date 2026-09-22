$root = 'C:\opt\workstations\project\blogs\taiping_blog'
Set-Location "$root\apps\edge"
& pnpm exec wrangler dev --port 8787
