const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ELK = require("elkjs");
const {validate, finite} = require("../src/shared/graph");
const branching = () => ({title:"Choose a path",nodes:[{id:"start",type:"start",label:"Start"},{id:"choice",type:"decision",label:"Which option?"},...Array.from({length:5},(_,i)=>({id:"path"+i,type:"step",label:"Option "+i})),{id:"end",type:"end",label:"End"}],connections:[{from:"start",to:"choice"},...Array.from({length:5},(_,i)=>({from:"choice",to:"path"+i,label:"Choice "+i})),...Array.from({length:5},(_,i)=>({from:"path"+i,to:"end"}))]});
test("missing positions stay missing",()=>{assert.equal(finite(null),null);assert.equal(finite(""),null);assert.equal(finite(undefined),null);assert.equal(finite(0),0);});
test("branches and merges validate without a four-port cap",()=>assert.equal(validate(branching()).connections.length,11));
test("duplicates and unreachable cycles are rejected",()=>{const p=branching();p.nodes.push({...p.nodes[0]});assert.throws(()=>validate(p),/duplicate/);const cycle=branching();cycle.nodes.push({id:"x",label:"X"},{id:"y",label:"Y"});cycle.connections.push({from:"x",to:"y"},{from:"y",to:"x"});assert.throws(()=>validate(cycle),/reached/);});
test("ELK preserves every edge and distinct anchors for high-degree nodes",async()=>{
  const context={window:{},FigyGraph:{validate},ELK:class {layout(graph){return new ELK().layout(JSON.parse(JSON.stringify(graph)));}}};vm.createContext(context);vm.runInContext(fs.readFileSync("src/js/flowLayout.js","utf8"),context);
  const result=await context.window.FigyLayout.arrange(branching());
  assert.equal(result.layout.edges.length,11);
  for(const node of result.layout.children){assert.equal(new Set(node.ports.map(p=>[p.x,p.y].join(","))).size,node.ports.length);}
  for(const a of result.layout.children)for(const b of result.layout.children){if(a===b)continue;assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);}
});
test("missing credentials fail instead of generating a pretend chart",async()=>{const {buildFlowchartWithAgents}=require("../src/server/agents/flowchartOrchestrator");await assert.rejects(buildFlowchartWithAgents({userPrompt:"Account recovery"},{}),/API key/);});
test("three coordinated stages preserve the approved process",async()=>{
  const original=global.fetch;
  const intent={goal:'Choose a path',chartStyle:'branching',requiresBranching:true,possiblePaths:[{label:'Yes'},{label:'No'}],assumptions:['Both options are available']};
  const process={title:'Choice',steps:[{id:'start',type:'start',label:'Start',nextStepId:'decision'},{id:'decision',type:'decision',label:'Proceed?',options:[{label:'Yes',nextStepId:'yes'},{label:'No',nextStepId:'no'}]},{id:'yes',type:'end',label:'Proceed'},{id:'no',type:'end',label:'Stop'}]};
  const graph={title:'Choice',nodes:process.steps.map(s=>({id:s.id,type:s.type,label:s.label})),connections:[{from:'start',to:'decision'},{from:'decision',to:'yes',label:'Yes'},{from:'decision',to:'no',label:'No'}]};
  global.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({intent,process,graph})}}]})});
  try{const {buildFlowchartWithAgents}=require('../src/server/agents/flowchartOrchestrator');const result=await buildFlowchartWithAgents({userPrompt:'A decision flow'},{HUGGINGFACE_API_KEY:'test-only'});assert.equal(result.plan.connections.length,3);assert.deepEqual(result.stages,{intent:'complete',process:'complete',graph:'complete'});assert.deepEqual(result.plan.assumptions,intent.assumptions);}
  finally{global.fetch=original;}
});
