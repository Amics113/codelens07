import * as vscode from "vscode";
import * as net from "net";

type BridgeRequest = {
  type: "context";
  task: "errorAnalysis" | "explanation" | "betterSolution";
  language: string;
  filePath: string;
  code: string;
  previousCode?: string;
  diagnostics: string;
  manual?: boolean;
  terminal?: string;
  requestId?: string;
};

const PIPE = "\\\\.\\pipe\\CodeLens";
const IDLE_MS = 5000;
let idleTimer: NodeJS.Timeout | undefined;
let lastDiagnosticSignature = "";
let lastSentVersion = -1;
let panel: vscode.WebviewPanel | undefined;
let output: vscode.OutputChannel;
let currentRequestId = "";

function collectContext(task: BridgeRequest["task"]): BridgeRequest | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const selected = editor.document.getText(editor.selection);
  const code = selected.trim() ? selected : editor.document.getText();
  const previousCode = editor.document.uri.toString() === lastDocumentUri
    ? previousDocumentText
    : "";
  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
    .map(d => {
      const sev = ["Error", "Warning", "Info", "Hint"][d.severity] ?? "Diagnostic";
      return `${sev} (${d.range.start.line + 1}:${d.range.start.character + 1}): ${d.message}`;
    }).join("\n");
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  currentRequestId = requestId;
  return {
    type: "context",
    task,
    language: editor.document.languageId,
    filePath: vscode.workspace.asRelativePath(editor.document.uri, false),
    code,
    previousCode: previousCode && previousCode !== code ? previousCode : undefined,
    diagnostics,
    manual: false,
    requestId
  };
}

let lastDocumentUri = "";
let previousDocumentText = "";

function rememberCurrentDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  if (uri !== lastDocumentUri) {
    lastDocumentUri = uri;
    previousDocumentText = editor.document.getText();
  }
}

function sendToDesktop(payload: BridgeRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: PIPE }, () => {
      socket.write(JSON.stringify(payload) + "\n", () => socket.end());
    });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("CodeLens desktop bridge timeout.")); });
    socket.on("data", () => resolve());
    socket.on("close", () => resolve());
    socket.on("error", reject);
  });
}

async function sendTask(task: BridgeRequest["task"], silent = false) {
  const payload = collectContext(task);
  if (!payload) return;
  payload.manual = !silent;
  try {
    if (panel) {
      panel.webview.postMessage({ type: "status", state: "analyzing", task });
    }
    await sendToDesktop(payload);
    if (!silent) vscode.window.showInformationMessage(`CodeLens: ${task === "errorAnalysis" ? "analysis" : task} sent.`);
  } catch (error) {
    output.appendLine(`Bridge unavailable: ${String(error)}`);
    if (panel) {
      panel.webview.postMessage({ type: "analysisResult", status: "error", task, error: "CodeLens desktop app is not running." });
    }
    if (!silent) vscode.window.showErrorMessage("CodeLens desktop app is not running. Start CodeLens and try again.");
  }
}

function diagnosticsForActiveEditor(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return "";
  return vscode.languages.getDiagnostics(editor.document.uri)
    .map(d => `${d.severity}:${d.range.start.line}:${d.range.start.character}:${d.message}`).join("|");
}

async function automaticErrorCheck() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
  if (!errors.length) return;
  const signature = diagnosticsForActiveEditor();
  if (signature === lastDiagnosticSignature) return;
  lastDiagnosticSignature = signature;
  lastSentVersion = editor.document.version;
  await sendTask("errorAnalysis", true);
  previousDocumentText = editor.document.getText();
  lastDocumentUri = editor.document.uri.toString();
  updatePanel("error", errors.length);
}

async function pollBridgeResult() {
  if (!panel || !currentRequestId) return;
  const requestId = currentRequestId;

  await new Promise<void>((resolve) => {
    let finished = false;
    let data = "";
    const socket = net.createConnection({ path: PIPE });

    const finish = () => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve();
    };

    socket.setTimeout(2500, finish);
    socket.on("connect", () => {
      socket.write(JSON.stringify({ type: "result", requestId }) + "\n");
    });
    socket.on("data", chunk => {
      data += chunk.toString();
      const line = data.trim().split(/\r?\n/)[0];
      if (!line || line === "OK") return;
      try {
        const result = JSON.parse(line) as {
          type?: string;
          requestId?: string;
          status?: "analyzing" | "complete" | "error" | "pending";
          task?: string;
          text?: string;
          error?: string;
          filePath?: string;
        };
        if (result.type !== "result" || result.requestId !== requestId) return;
        if (result.status === "pending") return;
        if (requestId !== currentRequestId) return;

        panel?.webview.postMessage({
          type: "analysisResult",
          status: result.status === "analyzing" ? "analyzing" : result.status,
          task: result.task,
          text: result.text ?? "",
          error: result.error ?? "",
          filePath: result.filePath ?? ""
        });
        if (result.status === "complete" || result.status === "error") {
          finish();
        }
      } catch {
        // Wait for the complete JSON line.
      }
    });
    socket.on("error", () => finish());
    socket.on("close", () => finish());
  });
}

function scheduleAutomaticAnalysis() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Every idle snapshot is automatically sent as errorAnalysis.
    // The CodeLens desktop Settings > Automatic IDE analysis switch decides
    // whether the desktop side performs the AI analysis.
    if (editor.document.version === lastSentVersion) return;

    lastSentVersion = editor.document.version;
    await sendTask("errorAnalysis", true);
    previousDocumentText = editor.document.getText();
    lastDocumentUri = editor.document.uri.toString();
  }, IDLE_MS);
}

function updatePanel(state: "monitoring" | "error", count: number) {
  if (!panel) return;
  panel.webview.postMessage({ type: "status", state, count });
}

function openPanel(context: vscode.ExtensionContext) {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside); return; }
  panel = vscode.window.createWebviewPanel("codelens", "CodeLens", vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true
  });

  panel.webview.html = `<!doctype html><html><head><meta charset="UTF-8"><style>
:root{color-scheme:dark}
body{font-family:var(--vscode-font-family,system-ui,sans-serif);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-size:13px}
h2{font-size:20px;margin:0}.sub{opacity:.68;margin:5px 0 14px;font-size:12px}
.status{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--vscode-panel-border);border-radius:7px;margin-bottom:10px}
.dot{width:8px;height:8px;border-radius:50%;background:#73d13d}.dot.busy{background:#e3b341}.dot.error{background:#f85149}
.workspace{display:flex;gap:10px;align-items:flex-start}
.rail{width:38px;display:flex;flex-direction:column;gap:6px;flex:0 0 38px}
.rail button{width:38px;height:38px;padding:0;font-size:15px;display:flex;align-items:center;justify-content:center}
.main{min-width:0;flex:1}
button{padding:6px 8px;border:1px solid var(--vscode-button-border,var(--vscode-panel-border));border-radius:5px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:12px}
button:hover{background:var(--vscode-button-secondaryHoverBackground)}button:disabled{opacity:.55;cursor:default}
#result{display:none}.empty{opacity:.65;text-align:center;padding:24px 8px;border:1px dashed var(--vscode-panel-border);border-radius:7px}
.card{border:1px solid var(--vscode-panel-border);border-radius:7px;padding:12px;margin-bottom:9px;background:var(--vscode-editorWidget-background)}
.card h3{font-size:13px;margin:0 0 7px}.card p{margin:5px 0;line-height:1.5}.card ul{margin:6px 0;padding-left:19px}.card li{margin:4px 0;line-height:1.45}
.code{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:5px;padding:10px;overflow:auto;white-space:pre-wrap;font-family:var(--vscode-editor-font-family,Consolas,monospace);font-size:12px}
.meta{opacity:.55;font-size:11px;margin-top:12px}.error{border-color:var(--vscode-testing-iconFailed,#f85149)}
</style></head><body>
<h2>CodeLens</h2><div class="sub">Read-only coding assistant</div>
<div id="status" class="status"><span id="dot" class="dot"></span><span id="statusText">Monitoring current file</span></div>
<div class="workspace">
  <div class="rail" aria-label="CodeLens tools">
    <button id="improve" title="Improve code" aria-label="Improve code">✦</button>
    <button id="explain" title="Explain code" aria-label="Explain code">?</button>
  </div>
  <div class="main">
    <div id="result"><div id="content"></div><div id="meta" class="meta"></div></div>
    <div id="empty" class="empty">Monitoring the active file.<br>CodeLens automatically analyzes it after 5 seconds of inactivity and returns the result here.</div>
  </div>
</div>
<script>
const vscode=acquireVsCodeApi();
const statusText=document.getElementById('statusText'),dot=document.getElementById('dot'),result=document.getElementById('result'),empty=document.getElementById('empty'),content=document.getElementById('content'),meta=document.getElementById('meta');
function esc(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(md){
  const lines=md.replace(/\r/g,'').split('\n'); let html='',inCode=false,buf=[];
  const flush=()=>{if(buf.length){html+='<div class="code">'+esc(buf.join('\n'))+'</div>';buf=[];}};
  for(const line of lines){
    if(line.trim().startsWith('\`\`\`')){if(inCode){flush();inCode=false;}else{inCode=true;}continue;}
    if(inCode){buf.push(line);continue;}
    if(/^#{1,4}\s+/.test(line)){html+='<div class="card"><h3>'+esc(line.replace(/^#{1,4}\s+/,''))+'</h3></div>';continue;}
    if(/^\s*[-*]\s+/.test(line)){if(!html.endsWith('<ul>'))html+='<ul>';html+='<li>'+esc(line.replace(/^\s*[-*]\s+/,''))+'</li>';continue;}
    if(html.endsWith('</li>'))html+='</ul>';
    if(/^\d+[.)]\s+/.test(line)){html+='<div class="card"><p><b>'+esc(line.match(/^\d+[.)]/)?.[0]??'')+'</b> '+esc(line.replace(/^\d+[.)]\s+/,''))+'</p></div>';continue;}
    if(line.trim())html+='<p>'+esc(line).replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')+'</p>';
  }
  if(inCode)flush(); if(html.endsWith('</li>'))html+='</ul>'; return html;
}
function show(m){
  if(m.status==='analyzing'){dot.className='dot busy';statusText.textContent='Analyzing current code…';empty.style.display='none';return;}
  if(m.status==='error'){dot.className='dot error';statusText.textContent='Analysis failed';result.style.display='block';empty.style.display='none';content.innerHTML='<div class="card error"><h3>Could not analyze</h3><p>'+esc(m.error||'Unknown error')+'</p></div>';return;}
  dot.className='dot';statusText.textContent=m.task==='errorAnalysis'?'Analysis complete':'Suggestion ready';result.style.display='block';empty.style.display='none';content.innerHTML=render(m.text||'No analysis was returned.');meta.textContent=(m.filePath?'File: '+m.filePath+' · ':'')+'CodeLens analysis · read-only';
}
document.getElementById('improve').onclick=()=>vscode.postMessage({type:'task',task:'betterSolution'});
document.getElementById('explain').onclick=()=>vscode.postMessage({type:'task',task:'explanation'});
window.addEventListener('message',e=>{const m=e.data;if(m.type==='status'){
  dot.className=m.state==='error'?'dot error':m.state==='analyzing'?'dot busy':'dot';
  statusText.textContent=m.state==='error'?'Error detected — analyzing…':m.state==='analyzing'?'Analyzing current code…':'Monitoring current file';
}if(m.type==='analysisResult')show(m);});
</script></body></html>`;

  panel.webview.onDidReceiveMessage(msg => {
    if (msg.type === "task" && ["errorAnalysis", "betterSolution", "explanation"].includes(msg.task)) {
      void sendTask(msg.task as BridgeRequest["task"]);
    }
  }, undefined, context.subscriptions);
  panel.onDidDispose(() => { panel = undefined; });
  updatePanel("monitoring", 0);
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel("CodeLens");
  context.subscriptions.push(output);
  rememberCurrentDocument();
  context.subscriptions.push(vscode.commands.registerCommand("codelens.open", () => openPanel(context)));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.findError", () => sendTask("errorAnalysis")));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.explainCode", () => sendTask("explanation")));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.betterSolution", () => sendTask("betterSolution")));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.security", () => sendTask("errorAnalysis")));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.performance", () => sendTask("betterSolution")));
  context.subscriptions.push(vscode.commands.registerCommand("codelens.tests", () => sendTask("explanation")));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    if (vscode.window.activeTextEditor?.document === e.document) {
      scheduleAutomaticAnalysis();
    }
  }));
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => {
    // IDE diagnostics are supplementary: the idle snapshot remains the authoritative
    // automatic AI request so runtime/semantic errors not exposed by the language
    // server are also analyzed.
    void automaticErrorCheck();
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    rememberCurrentDocument();
    lastDiagnosticSignature = "";
    lastSentVersion = -1;
    scheduleAutomaticAnalysis();
  }));
  openPanel(context);
  scheduleAutomaticAnalysis();
  const resultTimer = setInterval(() => { void pollBridgeResult(); }, 700);
  context.subscriptions.push({ dispose: () => clearInterval(resultTimer) });
}

export function deactivate() { if (idleTimer) clearTimeout(idleTimer); panel?.dispose(); }
