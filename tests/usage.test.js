const test=require('node:test');
const assert=require('node:assert/strict');
const {guardAIRequest}=require('../src/server/usage');
test('usage limits reject repeated calls',async()=>{const req={headers:{host:'localhost:4318'},socket:{remoteAddress:'usage-test'}};for(let i=0;i<10;i++)await guardAIRequest(req,{});await assert.rejects(guardAIRequest(req,{}),e=>e.statusCode===429);});
test('cross-origin requests and owner pause are rejected',async()=>{await assert.rejects(guardAIRequest({headers:{host:'figy.example',origin:'https://unrelated.example'}},{}),e=>e.statusCode===403);await assert.rejects(guardAIRequest({headers:{}},{AI_DISABLED:'true'}),e=>e.statusCode===503);});
