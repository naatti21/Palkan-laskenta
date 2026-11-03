import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('R41-08 HTTP error cannot replace a valid cached shell before offline recovery',async()=>{
 const listeners={};let cached=new Response('valid application');let online=true;
 const cache={put:async(_request,response)=>{cached=response;}};
 const context={self:{addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting(){},clients:{claim(){}}},
  caches:{open:async()=>cache,match:async()=>cached.clone()},
  fetch:async()=>{if(!online)throw new Error('offline');return new Response('temporary server error',{status:503});}};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 let response;listeners.fetch({request:{method:'GET'},respondWith:p=>{response=p;}});
 assert.equal((await response).status,503);await new Promise(resolve=>setImmediate(resolve));
 online=false;listeners.fetch({request:{method:'GET'},respondWith:p=>{response=p;}});
 assert.equal(await (await response).text(),'valid application');
});
