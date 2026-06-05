// 데스크톱 설치파일 배포 — GitHub Releases/PAT 없이 Railway(navis)가 직접 호스팅한다.
//
// 파이프라인:
//   1) GitHub Actions(맥/윈도우)가 .dmg/.exe + latest*.yml 를 빌드 →
//      PUT /api/desktop/upload?name=<파일> (Bearer 토큰) 로 이 서버에 올린다.
//   2) 파일은 config.desktopDir(= Railway 볼륨)에 저장된다.
//   3) 사람은 GET /download 에서 토큰 로그인 후 .dmg/.exe 를 받는다.
//   4) 설치된 앱의 electron-updater 는 generic provider 로 /api/desktop/file/latest*.yml
//      과 설치파일을 폴링해 자동 업데이트한다(요청 헤더에 Bearer 토큰).
//
// 인증은 navis 의 기존 APP_API_TOKEN(config.appApiToken)을 그대로 재사용한다.
// 토큰은 Authorization: Bearer 헤더 또는 ?token= 쿼리(브라우저 다운로드 링크용)로 받는다.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";

const DIR = resolve(config.desktopDir);

// 설치파일 확장자별 content-type (브라우저가 바로 다운로드하도록).
const MIME: Record<string, string> = {
  ".dmg": "application/x-apple-diskimage",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".zip": "application/zip",
  ".appimage": "application/octet-stream",
  ".yml": "text/yaml; charset=utf-8",
  ".blockmap": "application/octet-stream",
};

// 토큰을 상수시간 비교. 헤더(Bearer) 우선, 없으면 쿼리(?token=).
function authed(req: IncomingMessage, url: URL): boolean {
  const token = config.appApiToken;
  if (!token) return false;
  const header = req.headers["authorization"];
  let given: string | undefined;
  if (typeof header === "string") {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m) given = m[1];
  }
  if (!given) given = url.searchParams.get("token") ?? undefined;
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 경로 탈출 방지: basename 만 취하고 DIR 안으로 resolve 되는지 재확인.
function safePath(name: string): string | undefined {
  const base = basename(name);
  if (!base || base === "." || base === "..") return undefined;
  const full = resolve(DIR, base);
  if (full !== join(DIR, base)) return undefined;
  return full;
}

// PUT/POST /api/desktop/upload?name=<파일> — Actions 가 빌드 산출물을 올린다.
export async function handleDesktopUpload(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!config.appApiToken) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "desktop dist not configured" }));
    return;
  }
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = url.searchParams.get("name");
  const dest = name ? safePath(name) : undefined;
  if (!dest) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad or missing ?name" }));
    return;
  }
  try {
    await mkdir(DIR, { recursive: true });
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[desktop] 디렉터리 생성 실패 DIR=${DIR}:`, e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "mkdir failed",
        dir: DIR,
        code: e.code,
        message: e.message,
        hint: "DESKTOP_DIR 가 쓰기 가능한 경로인지 확인. Railway면 그 경로에 볼륨이 마운트돼 있어야 함.",
      }),
    );
    return;
  }
  try {
    await new Promise<void>((ok, fail) => {
      const out = createWriteStream(dest);
      req.pipe(out);
      out.on("finish", () => ok());
      out.on("error", fail);
      req.on("error", fail);
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: basename(dest) }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    console.error(`[desktop] 쓰기 실패 dest=${dest}:`, e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "write failed", dest, code: e.code, message: e.message }));
  }
}

// GET /api/desktop/list — 토큰 검증 후 보관 중인 파일 목록(JSON). 다운로드 페이지가 렌더용으로 호출.
export async function handleDesktopList(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  try {
    const names = await readdir(DIR).catch(() => [] as string[]);
    const files = await Promise.all(
      names.map(async (n) => {
        try {
          const s = await stat(join(DIR, n));
          return s.isFile() ? { name: n, size: s.size } : undefined;
        } catch {
          return undefined;
        }
      }),
    );
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ files: files.filter(Boolean) }));
  } catch (err) {
    console.error("[desktop] 목록 실패:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "list failed" }));
  }
}

// GET /api/desktop/file/<name> — 설치파일/latest*.yml 서빙. 사람(브라우저 ?token=)과
// electron-updater(Bearer 헤더) 둘 다 이 엔드포인트를 쓴다.
export async function handleDesktopFile(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/api\/desktop\/file\//, ""));
  const full = safePath(name);
  if (!full) {
    res.writeHead(400);
    res.end("bad name");
    return;
  }
  let info;
  try {
    info = await stat(full);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = (full.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  // .yml 은 inline(업데이터가 읽음), 설치파일은 attachment(브라우저 다운로드).
  const disposition = ext === ".yml" ? "inline" : `attachment; filename="${basename(full)}"`;
  res.writeHead(200, {
    "content-type": type,
    "content-length": info.size,
    "content-disposition": disposition,
    "cache-control": "no-cache",
  });
  createReadStream(full).pipe(res);
}

// GET /download — 토큰 로그인 페이지. 토큰 입력 → 목록 조회 → 설치파일 다운로드 버튼.
// 정적 HTML 한 장(인증은 안에서 fetch 로). 페이지 자체는 비밀이 없으므로 무인증.
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
  function show(token,files){
    $("#login").classList.add("hidden");
    var box=$("#list");box.classList.remove("hidden");
    var installers=files.filter(function(f){var x=f.name.toLowerCase();
      return x.endsWith(".dmg")||x.endsWith(".exe")||x.endsWith(".appimage")});
    if(!installers.length){box.innerHTML='<p class="sub">아직 올라온 설치파일이 없어요.</p>';return}
    box.innerHTML=installers.map(function(f){
      var href="/api/desktop/file/"+encodeURIComponent(f.name)+"?token="+encodeURIComponent(token);
      return '<a class="dl" href="'+href+'"><span>'+platLabel(f.name)+'</span><small>'+fmt(f.size)+'</small></a>'
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
