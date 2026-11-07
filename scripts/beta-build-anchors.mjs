// Build-time only. An ambiguous anchor must not produce a partially wired PWA.
export function replaceUnique(source, anchor, replacement, label) {
  if(typeof anchor!=='string'||anchor.length===0)throw new Error('Empty Beta anchor');
  const count=source.split(anchor).length-1;
  if(count!==1)throw new Error(`Beta anchor ${label}: expected 1 occurrence, found ${count}`);
  // Literal insertion (including dollar signs), never replacement-string expansion.
  return source.replace(anchor,()=>replacement);
}
