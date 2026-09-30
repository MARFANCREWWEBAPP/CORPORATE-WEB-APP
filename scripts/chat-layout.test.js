'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../portal/client-workflows.js'),'utf8');
const functions=source.slice(source.indexOf('  function auditResizeComposer('),source.indexOf('  window.visualViewport?',source.indexOf('  function auditResizeComposer(')));
function fixture(height=600){
  const properties=new Map(),shell={style:{setProperty:(key,value)=>properties.set(key,value)},getBoundingClientRect:()=>({top:180})};
  const context={window:{},innerWidth:1366,innerHeight:height,document:{documentElement:{style:{setProperty(){}}},body:{classList:{toggle(){}}},querySelector:()=>shell,querySelectorAll:()=>[]},getComputedStyle:()=>({minHeight:'58px',maxHeight:'90px',borderTopWidth:'1px',borderBottomWidth:'1px'})};
  vm.createContext(context);vm.runInContext(functions,context);return {context,properties};
}
test('Laptop chat fits the remaining height across the former 600px cutoff',()=>{
  for(const height of [480,600,601,768,900]){const {context,properties}=fixture(height);context.auditChatViewport();assert.equal(properties.get('--audit-chat-height'),`${height-192}px`);}
});
test('The visible viewport and current panel position determine the available height',()=>{
  const {context,properties}=fixture(768);context.window.visualViewport={height:400,offsetTop:30};context.auditChatViewport();assert.equal(properties.get('--audit-chat-height'),'238px');
});
test('Composer grows, limits long drafts and shrinks again after deletion',()=>{
  const {context}=fixture(),thread={scrollHeight:500,clientHeight:250,scrollTop:250};
  const field={style:{},scrollHeight:72,getClientRects:()=>[{}],closest:()=>({querySelector:()=>thread})};
  context.auditResizeComposer(field);assert.equal(field.style.height,'74px');assert.equal(field.style.overflowY,'hidden');
  field.scrollHeight=500;context.auditResizeComposer(field);assert.equal(field.style.height,'90px');assert.equal(field.style.overflowY,'auto');
  field.scrollHeight=40;context.auditResizeComposer(field);assert.equal(field.style.height,'58px');assert.equal(field.style.overflowY,'hidden');
});
test('Resizing a draft does not jump away from older messages being read',()=>{
  const {context}=fixture(),thread={scrollHeight:1000,clientHeight:250,scrollTop:150};
  context.auditResizeComposer({style:{},scrollHeight:100,getClientRects:()=>[{}],closest:()=>({querySelector:()=>thread})});assert.equal(thread.scrollTop,150);
});
