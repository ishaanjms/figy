(function () {
  const dialog = document.getElementById("flowPreview");
  const drawing = document.getElementById("previewDrawing");
  const error = document.getElementById("previewError");
  const assumptions = document.getElementById("previewAssumptions");
  let current, prompt, revision = 0;
  let previewScale=1;
  function zoomPreview(scale) {
    if(!current)return;
    previewScale=Math.max(.05,Math.min(2,scale));
    const svg=drawing.querySelector('svg');
    if(svg){svg.style.width=current.layout.width*previewScale+'px';svg.style.height=current.layout.height*previewScale+'px';}
  }
  function fitPreview() {if(current)zoomPreview(Math.min(drawing.clientWidth/current.layout.width,drawing.clientHeight/current.layout.height));}
  const svgNS = "http://www.w3.org/2000/svg";
  function svgElement(tag, attrs, text) {
    const el = document.createElementNS(svgNS,tag);
    Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function draw(plan) {
    drawing.replaceChildren();
    const l=plan.layout;
    const svg=svgElement('svg',{viewBox:`0 0 ${l.width} ${l.height}`,role:'img','aria-label':plan.title||'Flow preview'});
    const defs=svgElement('defs',{}),marker=svgElement('marker',{id:'previewArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'});
    marker.append(svgElement('path',{d:'M0 0L10 5L0 10',fill:'var(--connector-default)'}));defs.append(marker);svg.append(defs);
    l.edges.forEach(edge=>{edge.sections?.forEach(section=>{const points=[section.startPoint,...(section.bendPoints||[]),section.endPoint];svg.append(svgElement('path',{d:points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' '),fill:'none',stroke:'var(--connector-default)','stroke-width':2,'marker-end':'url(#previewArrow)'}));});edge.labels?.forEach(label=>svg.append(svgElement('text',{x:label.x,y:label.y+17,fill:'var(--text)','font-size':14},label.text)));});
    l.children.forEach(position=>{
      const node=plan.nodes.find(n=>n.id===position.id),{x,y,width:w,height:h}=position;
      const decision=/decision|choice/.test(node.type),terminal=/start|end|finish/.test(node.type);
      const shape=decision?svgElement('polygon',{points:`${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}`}):terminal?svgElement('ellipse',{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}):svgElement('rect',{x,y,width:w,height:h,rx:4});
      shape.setAttribute('fill',decision?'var(--shape-color-orange)':terminal?'var(--shape-color-green)':'var(--shape-color-white)');shape.setAttribute('stroke','var(--shape-stroke)');svg.append(shape);
      const words=(node.label+(node.detail?'\n'+node.detail:'')).split(/\s+/),lines=[];let line='';
      words.forEach(word=>{if((line+' '+word).length>30&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;});if(line)lines.push(line);
      lines.forEach((line,i)=>svg.append(svgElement('text',{x:x+w/2,y:y+h/2+(i-(lines.length-1)/2)*18,'text-anchor':'middle','dominant-baseline':'middle','font-size':14,fill:'var(--shape-label)'},line)));
    });
    drawing.append(svg);
    fitPreview();
  }
  function busy(value) {dialog.querySelectorAll('footer button').forEach(b=>b.disabled=value);}
  async function show(plan, sourcePrompt='') {
    prompt=sourcePrompt;error.textContent='Arranging flow...';busy(true);if(!dialog.open)dialog.showModal();
    const token=++revision;
    try {const prepared=await FigyLayout.arrange(plan);if(token!==revision)return;current=prepared;assumptions.value=(plan.assumptions||[]).join('\n');draw(prepared);error.textContent='';document.getElementById('insertFlow').textContent='Insert flow';}
    catch(e){current=null;error.textContent=e.message;}
    finally{if(token===revision){busy(false);document.getElementById('insertFlow').disabled=!current;}}
  }
  async function revise(instruction) {
    busy(true);error.textContent='Updating flow...';
    try{const request=prompt+'\n'+instruction+'\nAssumptions:\n'+assumptions.value;const plan=await FigyAI.requestAIFlowchartPlan(request,JSON.stringify({nodes:current.nodes,connections:current.connections}));await show(plan,prompt);}
    catch(e){error.textContent=e.message;busy(false);}
  }
  document.getElementById('simplifyFlow').onclick=()=>revise('Simplify this flow while retaining meaningful decisions.');
  document.getElementById('previewZoomIn').onclick=()=>zoomPreview(previewScale*1.3);
  document.getElementById('previewZoomOut').onclick=()=>zoomPreview(previewScale/1.3);
  document.getElementById('previewFit').onclick=fitPreview;
  document.getElementById('expandFlow').onclick=()=>revise('Add the most important exception and recovery paths.');
  document.getElementById('reviseFlow').onclick=()=>revise('Revise the flow to respect the edited assumptions.');
  document.getElementById('closePreview').onclick=()=>{revision++;dialog.close();};
  document.getElementById('insertFlow').onclick=async()=>{if(!current)return;busy(true);try{await FigyBoard.addAIFlowchart(current);dialog.close();}catch(e){error.textContent=e.message;}finally{busy(false);}};
  window.FigyPreview={show};
})();
