param(
  [string]$CardsTsv = "$HOME\Downloads\jp-celebs-cards\data\cards.tsv",
  [string]$OutDir   = "$HOME\Downloads\jp-celebs-cards\images",
  [string]$LogFile  = "$HOME\Downloads\jp-celebs-cards\logs\fetch.log",
  [switch]$Force,
  [int]$Limit = 0,
  # bad_images.txt（ブラウザの「不適切リスト出力」で生成）を渡すと
  # そのIDのみ強制的に再スクレイプします。
  [string]$BadList = ""
)

$ErrorActionPreference = "Stop"
$UA=@{"User-Agent"="jp-celebs-cards/1.0"}

function UrlEnc([string]$s){ [uri]::EscapeDataString($s) }
function Log($msg){ $ts=Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$ts  $msg" | Add-Content -Path $LogFile -Encoding UTF8 }
function AddAttr($id,$name,$src,$file,$lic,$artist,$credit){
  $csv = "$HOME\Downloads\jp-celebs-cards\data\attributions.csv"
  if(-not (Test-Path $csv)){ "id,name,source,filename,license,artist,credit" | Set-Content $csv -Encoding UTF8 }
  "$id,$name,$src,$file,$lic,$artist,$credit" | Add-Content $csv -Encoding UTF8
}
function AddMissing($id,$name){
  $csv = "$HOME\Downloads\jp-celebs-cards\data\missing.csv"
  if(-not (Test-Path $csv)){ "id,name" | Set-Content $csv -Encoding UTF8 }
  "$id,$name" | Add-Content $csv -Encoding UTF8
}
function Save-Url($url,[string]$preferName){
  # 拡張子をURLから推定
  $u = [uri]$url
  $ext = [IO.Path]::GetExtension($u.AbsolutePath)
  if([string]::IsNullOrWhiteSpace($ext)){ $ext = ".jpg" }
  $file = if($preferName -and $preferName.Contains(".")){ $preferName } else { ($preferName.TrimEnd(".") + $ext) }
  $dest = Join-Path $OutDir $file
  Invoke-WebRequest -Headers $UA -Uri $url -MaximumRedirection 5 -OutFile $dest -TimeoutSec 60 | Out-Null
  return $file # ファイル名だけ返す
}

function Get-QID([string]$name,[string]$category){
  $q = UrlEnc($name + $(if($category){" ($category)"} else {""}))
  $url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&language=ja&type=item&format=json&search=$q"
  $res = Invoke-RestMethod -Headers $UA $url
  return ($res.search | Select-Object -First 1).id
}
function Get-P18([string]$qid){
  if(-not $qid){ return $null }
  $url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=$qid&props=claims&format=json"
  $ent = Invoke-RestMethod -Headers $UA $url
  return $ent.entities.$qid.claims.P18.mainsnak.datavalue.value | Select-Object -First 1 # "File:xxx.png"
}
function Commons-ImageMeta([string]$title){
  if(-not $title){ return $null }
  $t = UrlEnc($title)
  $meta = Invoke-RestMethod -Headers $UA "https://commons.wikimedia.org/w/api.php?action=query&titles=$t&prop=imageinfo&iiprop=url|extmetadata&format=json"
  $p = $meta.query.pages.PSObject.Properties.Value | Select-Object -First 1
  if(-not $p){ return $null }
  $ii = $p.imageinfo | Select-Object -First 1
  if(-not $ii){ return $null }
  $em = $ii.extmetadata
  return [pscustomobject]@{
    Url  = $ii.url
    File = $p.title.Replace('File:','')
    Lic  = if($em.LicenseShortName.value){ $em.LicenseShortName.value } else { $em.License.value }
    Artist = $em.Artist.value -replace '<[^>]+>',''
    Credit = $em.Credit.value -replace '<[^>]+>',''
  }
}
function Get-CommonsByP180([string]$qid){
  if(-not $qid){ return $null }
  $q = UrlEnc("haswbstatement:P180=$qid filetype:bitmap -svg")
  $search = Invoke-RestMethod -Headers $UA "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=$q&srnamespace=6&srlimit=5&format=json"
  return ($search.query.search | Select-Object -First 1).title
}
function Get-WikipediaThumb([string]$name){
  foreach($host in @("ja.wikipedia.org","en.wikipedia.org")){
    $t = UrlEnc($name)
    $sr = Invoke-RestMethod -Headers $UA "https://$host/w/api.php?action=query&list=search&srsearch=$t&format=json&srlimit=1"
    $pid = ($sr.query.search | Select-Object -First 1).pageid
    if($pid){
      $pi = Invoke-RestMethod -Headers $UA "https://$host/w/api.php?action=query&pageids=$pid&prop=pageimages&piprop=original|thumbnail&pithumbsize=800&format=json"
      $pg = $pi.query.pages.$pid
      $src = $pg.thumbnail.source
      if($src){ return $src }
    }
  }
  return $null
}

# 準備
New-Item -ItemType Directory -Force $OutDir | Out-Null
New-Item -ItemType Directory -Force (Split-Path $LogFile) | Out-Null
"" | Set-Content $LogFile -Encoding UTF8

# BadList 読み込み（ブラウザの「不適切リスト出力」ボタンで生成した bad_images.txt）
$badIds = @{}
if($BadList -and (Test-Path $BadList)){
  Get-Content $BadList -Encoding UTF8 |
    Where-Object { $_ -ne "" -and $_ -ne "id" } |
    ForEach-Object { $badIds[$_.Trim()] = $true }
  Log "BadList loaded: $($badIds.Count) IDs を強制再スクレイプします"
}

# TSV 読み
$raw = (Get-Content $CardsTsv -Raw) -replace "^\uFEFF",""
$lines = $raw -split "\r?\n" | Where-Object { $_ -ne "" }
$rows = $lines | Select-Object -Skip 1 | ForEach-Object {
  $c = $_.Split("`t")
  # cards.tsv の列順は id, name, yomi, category（BOM 付きヘッダ）
  [pscustomobject]@{ id=$c[0]; name=$c[1]; yomi=$c[2]; category=$c[3] }
}
if($Limit -gt 0){ $rows = $rows | Select-Object -First $Limit }

# BadList 指定時はそのIDのみ処理（-Force 相当）
if($badIds.Count -gt 0 -and -not $Force){
  $rows = $rows | Where-Object { $badIds.ContainsKey($_.id) }
  Log "BadList モード: $($rows.Count) 件のみ処理"
}

foreach($row in $rows){
  $id = $row.id; $name = $row.name
  $forceThis = $Force -or $badIds.ContainsKey($id)
  Log "FETCH [$id] $name$(if($forceThis -and $badIds.ContainsKey($id)){' [BAD→再取得]'})"

  # QID
  $qid = Get-QID $name $row.category
  if($qid){ Log "  QID=$qid" }

  # 1) P18
  $p18 = Get-P18 $qid
  if($p18){
    $cm = Commons-ImageMeta $p18
    if($cm){
      $file = $cm.File
      $dest = Join-Path $OutDir $file
      if((Test-Path $dest) -and (-not $forceThis)){ Log "  SKIP (exists) $file"; continue }
      try{
        $saved = Save-Url $cm.Url $file
        AddAttr $id $name "Commons:P18" $saved $cm.Lic $cm.Artist $cm.Credit
        Log "  P18 OK -> $saved"
        Start-Sleep -Milliseconds 250
        continue
      }catch{}
    }
  }

  # 2) haswbstatement:P180
  $t180 = Get-CommonsByP180 $qid
  if($t180){
    $cm = Commons-ImageMeta $t180
    if($cm){
      $file = $cm.File
      $dest = Join-Path $OutDir $file
      if((Test-Path $dest) -and (-not $forceThis)){ Log "  SKIP (exists) $file"; continue }
      try{
        $saved = Save-Url $cm.Url $file
        AddAttr $id $name "Commons:P180" $saved $cm.Lic $cm.Artist $cm.Credit
        Log "  P180 OK -> $saved"
        Start-Sleep -Milliseconds 250
        continue
      }catch{}
    }
  }

  # 3) Wikipedia PageImages
  $thumb = Get-WikipediaThumb $name
  if($thumb){
    try{
      $saved = Save-Url $thumb "$id"   # 拡張子はURLから推定
      AddAttr $id $name "Wikipedia:pageimages" $saved "Unknown" "Unknown" "From Wikipedia thumbnail"
      Log "  WIKI OK -> $saved"
      Start-Sleep -Milliseconds 200
      continue
    }catch{}
  }

  Log "FAIL [$id] $name"
  AddMissing $id $name
}
Log "Done."

