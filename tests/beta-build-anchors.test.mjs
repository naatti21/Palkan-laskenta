import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replaceUnique} from '../scripts/beta-build-anchors.mjs';

test('critical Beta anchors reject source drift and duplicate bootstrap targets',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const anchor of ['<script type="module" src="./app.js"></script>',
    '<div id="history"></div>','<section data-view="tracking">']){
    assert.equal(replaceUnique(html,anchor,'TEST','critical'),html.replace(anchor,'TEST'));
    assert.throws(()=>replaceUnique(html.replace(anchor,''),anchor,'TEST','critical'),/found 0/);
    assert.throws(()=>replaceUnique(html+anchor,anchor,'TEST','critical'),/found 2/);
  }
});
test('offline dependency anchors cannot silently disappear or be duplicated',()=>{
  const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  for(const anchor of ['const CACHE_PREFIX = "palkka-pwa-v";', 'const CACHE = `${CACHE_PREFIX}19`;',
    '"./", "./index.html",','"./app.js", "./parser.js",',
    '"./icon-192.png", "./icon-512.png"','"./model.js", "./analytics.js",']){
    assert.equal(replaceUnique(sw,anchor,'TEST','offline'),sw.replace(anchor,'TEST'));
    assert.throws(()=>replaceUnique(sw.replace(anchor,''),anchor,'TEST','offline'),/found 0/);
    assert.throws(()=>replaceUnique(sw+anchor,anchor,'TEST','offline'),/found 2/);
  }
});
test('replacement content is literal, with actionable anchor errors',()=>{
  assert.equal(replaceUnique('before <body> after','<body>','$& $` $\'','body'),"before $& $` $' after");
  assert.throws(()=>replaceUnique('abc','','x','empty'),/Empty Beta anchor/);
  assert.throws(()=>replaceUnique('abc','absent','x','planner scripts'),/planner scripts.*found 0/);
});
