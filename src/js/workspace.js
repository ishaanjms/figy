(function () {
  const key = "figy-workspace-v1";
  const status = document.getElementById("saveStatus");
  let pending;
  let restoring = false;
  let readFailed = false;
  let copied = null;
  const items = () => [...canvas.children].filter(e => e !== drawLayer);
  const selected = () => [...selectedElements].filter(e => e.parentElement === canvas);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function save() {
    if (restoring || readFailed) return;
    status.textContent = "Saving...";
    clearTimeout(pending);
    pending = setTimeout(flush, 250);
  }
  function flush() {
    clearTimeout(pending);
    if (restoring || readFailed) return;
    try {
      const data = { version: 1, name: fileName.value, board: serializeBoard(), chat: typeof chatHistory !== "undefined" ? chatHistory.filter(m => m.content !== "Thinking...") : [], view: { zoom, panX, panY }, savedAt: Date.now() };
      const previous = localStorage.getItem(key);
      if (previous) {
        const old = JSON.parse(previous);
        if (JSON.stringify(old.board) !== JSON.stringify(data.board) || JSON.stringify(old.chat) !== JSON.stringify(data.chat)) localStorage.setItem(key + "-backup", previous);
      }
      localStorage.setItem(key, JSON.stringify(data));
      status.textContent = "Saved locally";
    } catch { status.textContent = "Could not save on this device"; }
  }
  function validateFile(data) {
    if (data?.version !== 1 || !Array.isArray(data.board?.items) || !Array.isArray(data.board?.connectors) || !Array.isArray(data.board?.strokes)) throw new Error("This is not a Figy board file.");
    if (data.board.items.length > 2000 || data.board.connectors.length > 4000) throw new Error("This board is too large to import.");
    const ids = new Set();
    for (const item of data.board.items) {
      if (!["sticky", "shape", "text", "stroke"].includes(item.type) || ![item.x,item.y,item.width,item.height].every(Number.isFinite) || item.width <= 0 || item.height <= 0) throw new Error("The board contains an invalid object.");
      if (item.id) {
        if (!/^item-\d+$/.test(item.id) || ids.has(item.id)) throw new Error("The board contains invalid object IDs.");
        ids.add(item.id);
      }
      if(item.type==='stroke') {
        let points;try{points=typeof item.points==='string'?JSON.parse(item.points):item.points;}catch{throw new Error('Invalid drawing.');}
        if(!Array.isArray(points)||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw new Error('Invalid drawing.');
      }
    }
    for (const edge of data.board.connectors) {
      if (!ids.has(edge.fromId) || !ids.has(edge.toId) || ![edge.fromSide,edge.toSide].every(s => ["n","e","s","w"].includes(s))) throw new Error("The board contains an invalid connection.");
      for (const port of [edge.fromPort, edge.toPort]) if (port && ![port.x,port.y].every(n => Number.isFinite(n) && n >= -.02 && n <= 1.02)) throw new Error("Invalid connector anchor.");
      if (edge.route && (!Array.isArray(edge.route) || !edge.route.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))) throw new Error("Invalid connector route.");
    }
    return data;
  }
  function load(data) {
    validateFile(data);
    restoring = true;
    try {
      restoreBoard(data.board);
      setFileName(data.name || "Untitled");
      historyStack = [JSON.stringify(serializeBoard())];
      redoStack = [];
      if (typeof chatHistory !== "undefined") {
        chatHistory = Array.isArray(data.chat) && data.chat.length ? data.chat.filter(m => ["user","assistant"].includes(m.role) && typeof m.content === "string") : [{ role:"assistant", content:chatWelcomeMessage }];
        renderChatMessages();
      }
      setZoom(data.view?.zoom || 1);
      setPan(Number(data.view?.panX) || 0, Number(data.view?.panY) || 0);
      status.textContent = "Saved locally";
      readFailed = false;
    } finally { restoring = false; }
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function fit(elements = selected().length ? selected() : items()) {
    if (!elements.length) return;
    const left = Math.min(...elements.map(e => e.offsetLeft));
    const top = Math.min(...elements.map(e => e.offsetTop));
    const right = Math.max(...elements.map(e => e.offsetLeft + e.offsetWidth));
    const bottom = Math.max(...elements.map(e => e.offsetTop + e.offsetHeight));
    const available = innerWidth - (chatPanel.classList.contains("open") && innerWidth > 800 ? 430 : 80);
    setZoom(Math.min(1, available / (right-left+80), (innerHeight-210)/(bottom-top+80)));
    setPan(available/2 - (left+right)/2*zoom + 30, (innerHeight-60)/2 - (top+bottom)/2*zoom);
    save();
  }
  function selectionContext() {
    const chosen = selected();
    if (!chosen.length) return "";
    const ids = new Set(chosen.map(e => e.dataset.elementId));
    const snapshot = serializeBoard();
    return JSON.stringify({ objects: chosen.map(e => ({ id:e.dataset.elementId, text:getEditableArea(e)?.innerText || "", type:e.classList.contains("shape-item") ? e.dataset.shape : "note" })), connections:snapshot.connectors.filter(e => ids.has(e.fromId) || ids.has(e.toId)).map(e => ({from:e.fromId,to:e.toId,label:e.label})) });
  }
  function copyGroup() {
    const chosen = selected();
    if (!chosen.length) return;
    const all = items(), snapshot = serializeBoard();
    const ids = new Set(chosen.map(e => e.dataset.elementId));
    copied = { items:snapshot.items.filter((_,i) => chosen.includes(all[i])), connectors:snapshot.connectors.filter(e => ids.has(e.fromId)&&ids.has(e.toId)), strokes:[] };
  }
  function pasteGroup() {
    if (!copied) return;
    const current = serializeBoard();
    const clone = JSON.parse(JSON.stringify(copied));
    const idMap = new Map();
    const groups = new Map();
    clone.items.forEach(item=>{if(item.groupId){if(!groups.has(item.groupId))groups.set(item.groupId,crypto.randomUUID());item.groupId=groups.get(item.groupId);}});
    clone.items.forEach(item => { if(item.id) {const old=item.id;item.id=getNextElementId();idMap.set(old,item.id);} item.x+=32;item.y+=32; });
    clone.connectors.forEach(edge => {edge.fromId=idMap.get(edge.fromId);edge.toId=idMap.get(edge.toId);edge.route=null;edge.routeBounds="";});
    restoreBoard({ items:[...current.items,...clone.items], connectors:[...current.connectors,...clone.connectors], strokes:current.strokes });
    selectElements(items().slice(-clone.items.length));
    saveHistory();
  }
  function reviewPage() {
    const boardItems = serializeBoard().items;
    if (!boardItems.length) return;
    const left=Math.min(...boardItems.map(i=>i.x))-30, top=Math.min(...boardItems.map(i=>i.y))-30;
    const width=Math.max(...boardItems.map(i=>i.x+i.width))-left+30, height=Math.max(...boardItems.map(i=>i.y+i.height))-top+30;
    const lines=[...drawLayer.querySelectorAll(".connector-line")].map(line=>'<path d="'+esc(line.getAttribute("d"))+'" fill="none" stroke="#707070" stroke-width="3" marker-end="url(#arrow)"/>').join("");
    const labels=[...drawLayer.querySelectorAll(".edge-label")].map(label=>'<text x="'+label.getAttribute("x")+'" y="'+label.getAttribute("y")+'" text-anchor="middle" font-size="16">'+esc(label.textContent)+'</text>').join("");
    const content=boardItems.map(i=>{
      const text=esc(i.text||i.label||"");
      if(i.type==="stroke") return '<svg x="'+i.x+'" y="'+i.y+'" width="'+i.width+'" height="'+i.height+'" viewBox="0 0 '+i.width+' '+i.height+'"><polyline points="'+JSON.parse(i.points).map(p=>p.x+','+p.y).join(' ')+'" fill="none" stroke="'+esc(i.color)+'" stroke-width="'+i.strokeWidth+'"/></svg>';
      const fill=i.type==="text"?"none":i.type==="sticky"?"#a9daf7":getShapeColorValue(i.color||"white");
      const shape=i.shape==="diamond"?'<polygon points="'+(i.x+i.width/2)+','+i.y+' '+(i.x+i.width)+','+(i.y+i.height/2)+' '+(i.x+i.width/2)+','+(i.y+i.height)+' '+i.x+','+(i.y+i.height/2)+'"':i.shape==="circle"?'<ellipse cx="'+(i.x+i.width/2)+'" cy="'+(i.y+i.height/2)+'" rx="'+i.width/2+'" ry="'+i.height/2+'"':'<rect x="'+i.x+'" y="'+i.y+'" width="'+i.width+'" height="'+i.height+'"';
      return shape+' fill="'+fill+'" stroke="'+(i.type==="shape"?'#707070':'none')+'"/><foreignObject x="'+i.x+'" y="'+i.y+'" width="'+i.width+'" height="'+i.height+'"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:18px;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font:16px Arial;color:#222">'+text+'</div></foreignObject>';
    }).join("");
    download('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(fileName.value)+'</title><style>body{margin:24px;font-family:Arial;background:#f7f7f7}svg{width:100%;height:auto}h1{font-size:22px}</style><h1>'+esc(fileName.value)+'</h1><svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[left,top,width,height].join(' ')+'"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#707070"/></marker></defs>'+lines+content+labels+'</svg>',fileName.value+'-review.html','text/html');
  }
  async function revisionPlan(instruction, plan) {
    const reply=await FigyAI.requestAIReply([{role:'user',content:'Revise this selected flow. Return only JSON with title, nodes [{id,type,label,detail}], connections [{from,to,label}]. Keep ALL existing node IDs. You may add steps with new IDs. Preserve unchanged labels and connections. Apply only the requested change. Decisions need labeled choices. Request: '+instruction+'\nCurrent flow: '+JSON.stringify(plan)}],{responseFormat:'json',maxTokens:3200,includeSelection:false});
    const clean=reply.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    let result;
    try{result=JSON.parse(clean);}catch{throw new Error('The revision was incomplete. Please retry.');}
    FigyGraph.validate(result);
    if(plan.nodes.some(n=>!result.nodes.some(m=>m.id===n.id)))throw new Error('The revision removed an existing step. Please retry.');
    return result;
  }
  window.FigyWorkspace={save,flush,fit,selectionContext,validateFile,revisionPlan};
  document.getElementById('connectSelected').onclick=()=>{const chosen=selected().filter(e=>e.classList.contains('connectable'));if(chosen.length!==2){status.textContent='Select two objects to connect';return;}const sides=getFlowchartConnectionSides(chosen[0],chosen[1]);createConnectorLine(chosen[0].dataset.elementId,sides.from,chosen[1].dataset.elementId,sides.to);saveHistory();};
  document.getElementById('refineSelected').onclick=()=>{if(!selected().some(e=>e.classList.contains('connectable'))){status.textContent='Select a flow to refine';return;}document.getElementById('refineDialog').showModal();};
  document.getElementById('cancelRefine').onclick=()=>document.getElementById('refineDialog').close();
  document.getElementById('refineForm').onsubmit=async e=>{
    e.preventDefault();const error=document.getElementById('refineError'),submit=e.target.querySelector('[type=submit]');submit.disabled=true;error.textContent='Preparing revision...';
    const chosen=selected().filter(e=>e.classList.contains('connectable')),ids=chosen.map(e=>e.dataset.elementId);
    const context={title:'Selected flow',nodes:chosen.map(el=>({id:el.dataset.elementId,type:el.dataset.shape==='diamond'?'decision':'step',label:getEditableArea(el).innerText})),connections:serializeBoard().connectors.filter(c=>ids.includes(c.fromId)&&ids.includes(c.toId)).map(c=>({from:c.fromId,to:c.toId,label:c.label}))};
    const replacement={ids,snapshot:JSON.stringify(serializeBoard())};
    const instruction=document.getElementById('refineInstruction').value;
    try{const plan=await revisionPlan(instruction,context);document.getElementById('refineDialog').close();await FigyPreview.show(plan,instruction,replacement);error.textContent='';}catch(err){error.textContent=err.message;}finally{submit.disabled=false;}
  };
  document.getElementById("reviewBoard").onclick=reviewPage;
  document.getElementById("fitBoard").onclick=()=>fit();
  document.getElementById("undoBoard").onclick=undoBoardChange;
  document.getElementById("redoBoard").onclick=redoBoardChange;
  document.getElementById("alignBoard").onclick=()=>{const chosen=selected();if(chosen.length<2)return;const left=Math.min(...chosen.map(e=>e.offsetLeft));chosen.forEach(e=>e.style.left=left+'px');updateConnectorPositions();saveHistory();};
  document.getElementById("boardSearch").oninput=e=>{const q=e.target.value.trim().toLowerCase();const hits=items().filter(el=>q && (getEditableArea(el)?.innerText||'').toLowerCase().includes(q));selectElements(hits);if(hits.length)fit(hits);};
  document.addEventListener('keydown',e=>{
    if(isEditableTarget(e.target))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selectElements(items());return;}
    if(e.key==='Escape'){clearSelection();return;}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'&&selected().length){e.preventDefault();e.stopImmediatePropagation();copyGroup();}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'&&copied){e.preventDefault();e.stopImmediatePropagation();pasteGroup();}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&selected().length){e.preventDefault();const n=e.shiftKey?10:1;selected().forEach(el=>{el.style.left=el.offsetLeft+(e.key==='ArrowLeft'?-n:e.key==='ArrowRight'?n:0)+'px';el.style.top=el.offsetTop+(e.key==='ArrowUp'?-n:e.key==='ArrowDown'?n:0)+'px';});updateConnectorPositions();saveHistory();}
  },true);
  fileName.addEventListener('input',save);
  window.addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  try{const stored=localStorage.getItem(key);if(stored)load(JSON.parse(stored));else status.textContent='Saved locally';}catch{readFailed=true;status.textContent='Could not reopen saved board';}
  lucide.createIcons();

  const tooltip = document.createElement('div');
  tooltip.id = 'workspaceTooltip';
  tooltip.className = 'workspace-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let tooltipTarget = null;
  let tooltipTimer;

  function hideTooltip() {
    clearTimeout(tooltipTimer);
    tooltipTarget?.removeAttribute('aria-describedby');
    tooltipTarget = null;
    tooltip.hidden = true;
  }

  function showTooltip(button) {
    hideTooltip();
    tooltipTarget = button;
    tooltip.textContent = button.dataset.tooltip;
    tooltip.hidden = false;
    button.setAttribute('aria-describedby', tooltip.id);
    const target = button.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(target.left + (target.width - bounds.width) / 2, innerWidth - bounds.width - 8));
    const top = target.bottom + bounds.height + 8 <= innerHeight ? target.bottom + 8 : Math.max(8, target.top - bounds.height - 8);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  document.querySelectorAll('#workspaceActions button').forEach(button => {
    button.dataset.tooltip = button.title || button.getAttribute('aria-label');
    button.removeAttribute('title');
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hideTooltip();
      tooltipTimer = setTimeout(() => showTooltip(button), 200);
    });
    button.addEventListener('pointerleave', hideTooltip);
    button.addEventListener('focus', () => showTooltip(button));
    button.addEventListener('blur', hideTooltip);
    button.addEventListener('pointerdown', hideTooltip);
    button.addEventListener('click', hideTooltip);
  });
  window.addEventListener('resize', hideTooltip);
  window.addEventListener('scroll', hideTooltip, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
})();
