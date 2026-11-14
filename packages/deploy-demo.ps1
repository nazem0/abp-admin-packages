# Builds the sample host + Angular demo into one site and pushes it with Web Deploy (IIS hosting such as MonsterASP).
#   .deploy/  (gitignored) must hold:
#     *.publishSettings              the host's Web Deploy profile
#     appsettings.Production.json    site URLs, "Data Source=abpadmin.db", MigrateOnStartup, AuthServer:CertificatePassPhrase
#     openiddict.pfx                 OpenIddict signing/encryption certificate for that passphrase
# Usage: pwsh packages/deploy-demo.ps1 [-Runtime win-x86]   (win-x86: the hosting app pool is 32-bit)
param([string]$Runtime = 'win-x86', [string]$Secrets = "$PSScriptRoot/.deploy")
$ErrorActionPreference = 'Stop'
$site = Join-Path ([IO.Path]::GetTempPath()) 'abp-admin-demo-site'
Remove-Item $site -Recurse -Force -ErrorAction SilentlyContinue

dotnet publish "$PSScriptRoot/backend/samples/AbpAdmin.Host" -c Release -r $Runtime --self-contained -o $site
if ($LASTEXITCODE) { throw 'dotnet publish failed' }

Push-Location "$PSScriptRoot/frontend"
try {
    pnpm build:lib; if ($LASTEXITCODE) { throw 'library build failed' }
    pnpm exec ng build demo --base-href /app/; if ($LASTEXITCODE) { throw 'demo build failed' }
} finally { Pop-Location }
Copy-Item "$PSScriptRoot/frontend/dist/demo/browser" "$site/wwwroot/app" -Recurse

Copy-Item "$Secrets/appsettings.Production.json", "$Secrets/openiddict.pfx" $site
Remove-Item "$site/appsettings.Development.json" -ErrorAction SilentlyContinue

$p = ([xml](Get-Content (Get-ChildItem $Secrets -Filter *.publishSettings)[0].FullName)).publishData.publishProfile |
    Where-Object publishMethod -eq 'MSDeploy'
$dest = "contentPath='$($p.msdeploySite)',ComputerName='https://$($p.publishUrl):8172/msdeploy.axd?site=$($p.msdeploySite)',UserName='$($p.userName)',Password='$($p.userPWD)',AuthType='Basic'"
# Keeps the server's SQLite database and logs.
& 'C:\Program Files\IIS\Microsoft Web Deploy V3\msdeploy.exe' -verb:sync "-source:contentPath='$site'" "-dest:$dest" `
    -allowUntrusted -enableRule:AppOffline -retryAttempts:3 `
    '-skip:objectName=filePath,absolutePath=abpadmin\.db' '-skip:objectName=filePath,absolutePath=abpadmin\.db-.*' `
    '-skip:objectName=dirPath,absolutePath=\\Logs$' '-skip:objectName=filePath,absolutePath=\\Logs\\.*' |
    Select-String -NotMatch 'Adding file|Updating file|Deleting file'
"Deployed: $($p.destinationAppUrl)"
