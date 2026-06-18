// 데스크톱 다운로드 페이지(/download) 핸들러 + 정적 HTML.
// 토큰 입력 → 목록 조회 → 설치파일 다운로드 버튼. 인증은 페이지 안 fetch 가 담당.
import type { ServerResponse } from "node:http";

// GET /download — 토큰 로그인 페이지. 정적 HTML 한 장(페이지 자체는 비밀이 없으므로 무인증).
export function handleDownloadPage(res: ServerResponse): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(DOWNLOAD_HTML);
}

const DOWNLOAD_HTML = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Navis 데스크톱 다운로드</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0f;color:#e7e7ea;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .card{width:min(420px,92vw);background:#15151c;border:1px solid #26262f;border-radius:16px;padding:28px}
  h1{font-size:19px;margin:0 0 4px} p.sub{margin:0 0 20px;color:#9a9aa6;font-size:13px}
  input{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1px solid #30303a;background:#0e0e14;color:#fff;font-size:14px}
  button{width:100%;margin-top:12px;padding:11px;border:0;border-radius:10px;background:#6d5cff;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  .err{color:#ff7a7a;font-size:13px;margin-top:10px;min-height:18px}
  .list{margin-top:18px;display:flex;flex-direction:column;gap:10px}
  a.dl{display:flex;justify-content:space-between;align-items:center;text-decoration:none;padding:13px 15px;border-radius:11px;background:#0e0e14;border:1px solid #30303a;color:#fff}
  a.dl small{color:#9a9aa6}
  .hidden{display:none}
</style></head>
<body><div class="card">
  <h1>Navis 데스크톱</h1>
  <p class="sub">토큰을 입력하면 설치파일을 받을 수 있어요.</p>
  <div id="login">
    <input id="tok" type="password" placeholder="액세스 토큰" autocomplete="off"/>
    <button id="go">들어가기</button>
    <div class="err" id="err"></div>
  </div>
  <div class="list hidden" id="list"></div>
</div>
<script>
  var $=function(s){return document.querySelector(s)};
  function fmt(n){return n>1e6?(n/1048576).toFixed(1)+" MB":(n/1024).toFixed(0)+" KB"}
  function platLabel(name){var x=name.toLowerCase();
    if(x.endsWith(".dmg"))return "macOS (.dmg)";
    if(x.endsWith(".exe"))return "Windows (.exe)";
    if(x.endsWith(".appimage"))return "Linux (.AppImage)";
    return name}
  function ver(name){var m=name.match(/(\\d+\\.\\d+\\.\\d+)/);return m?m[1]:"0.0.0"}
  function cmpVer(a,b){var pa=a.split(".").map(Number),pb=b.split(".").map(Number);
    for(var i=0;i<3;i++){var d=(pa[i]||0)-(pb[i]||0);if(d)return d}return 0}
  function show(token,files){
    $("#login").classList.add("hidden");
    var box=$("#list");box.classList.remove("hidden");
    var installers=files.filter(function(f){var x=f.name.toLowerCase();
      return x.endsWith(".dmg")||x.endsWith(".exe")||x.endsWith(".appimage")});
    if(!installers.length){box.innerHTML='<p class="sub">아직 올라온 설치파일이 없어요.</p>';return}
    // 플랫폼(확장자)별로 최신 버전 하나만 — 옛 버전 잔여물이 섞여 보이지 않게.
    var byPlat={};
    installers.forEach(function(f){var ext=f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if(!byPlat[ext]||cmpVer(ver(f.name),ver(byPlat[ext].name))>0)byPlat[ext]=f});
    var latest=Object.keys(byPlat).map(function(k){return byPlat[k]});
    box.innerHTML=latest.map(function(f){
      var href="/api/desktop/file/"+encodeURIComponent(f.name)+"?token="+encodeURIComponent(token);
      return '<a class="dl" href="'+href+'"><span>'+platLabel(f.name)+' · v'+ver(f.name)+'</span><small>'+fmt(f.size)+'</small></a>'
    }).join("");
  }
  async function enter(){
    var t=$("#tok").value.trim();if(!t)return;
    $("#go").disabled=true;$("#err").textContent="";
    try{
      var r=await fetch("/api/desktop/list?token="+encodeURIComponent(t));
      // 실패 원인을 구분해서 보여준다(토큰 / 서버 / 네트워크).
      if(r.status===401){
        sessionStorage.removeItem("navis_dl_tok");
        $("#err").textContent="토큰이 올바르지 않아요. 앞뒤 공백이나 자동완성으로 들어간 값이 아닌지 확인해줘.";
        $("#go").disabled=false;return;
      }
      if(!r.ok){$("#err").textContent="서버 오류예요 (상태 "+r.status+"). 잠시 후 다시 시도해줘.";$("#go").disabled=false;return}
      var j=await r.json();
      sessionStorage.setItem("navis_dl_tok",t);
      show(t,j.files||[]);
    }catch(e){$("#err").textContent="서버에 연결하지 못했어요. 네트워크 상태를 확인해줘.";$("#go").disabled=false}
  }
  $("#go").onclick=enter;
  $("#tok").addEventListener("keydown",function(e){if(e.key==="Enter")enter()});
  var saved=sessionStorage.getItem("navis_dl_tok");
  if(saved){$("#tok").value=saved;enter()}
</script>
</body></html>`;
