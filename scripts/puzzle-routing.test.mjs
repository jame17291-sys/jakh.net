import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { puzzlePath, puzzleRoute, legacyPuzzleTarget } from '../puzzle-routes.js';
import { challengeURL } from '../puzzle-daily.js';

test('daily challenge links use stable clean game routes and retain the exact shared date and difficulty',()=>{
  for(const lang of ['en','ar']){
    const url=new URL(challengeURL({game:'sudoku',lang,date:'2026-09-30',difficulty:'hard'}));
    assert.equal(url.pathname,puzzlePath('sudoku',lang));
    assert.deepEqual(Object.fromEntries(url.searchParams),{date:'2026-09-30',edition:'2',difficulty:'hard'});
  }
  const legacy=new URL('https://riddlearabia.com/ar/play/?game=duel&duelRoom=ABCD2345');
  assert.equal(legacyPuzzleTarget(legacy).pathname,'/ar/games/word-duel/');
  assert.equal(legacyPuzzleTarget(legacy).searchParams.get('duelRoom'),'ABCD2345');
  assert.equal(legacyPuzzleTarget(new URL('https://riddlearabia.com/play?game=unknown')),null);
  assert.equal(puzzleRoute(new URL('https://riddlearabia.com/sudoku?game=word').pathname).id,'sudoku');
});
test('service-worker caching separates legacy redirected games and query-state responses from clean pages',async()=>{
  const sandbox={URL,Request,Response,Headers,self:{location:{origin:'https://riddlearabia.com'},addEventListener(){}}};
  vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),sandbox);
  const response=(url,headers={})=>({url,status:200,type:'basic',headers:new Headers({'content-type':'text/html',...headers})});
  assert.equal(sandbox.navigationResponseMatches(new Request('https://riddlearabia.com/play?game=sudoku'),response('https://riddlearabia.com/sudoku')),false);
  assert.equal(sandbox.navigationResponseMatches(new Request('https://riddlearabia.com/sudoku.html'),response('https://riddlearabia.com/sudoku')),true);
  assert.equal(sandbox.navigationResponseMatches(new Request('https://riddlearabia.com/sudoku'),response('https://evil.example/sudoku')),false);
  assert.equal(sandbox.isCacheableResponse(response('https://riddlearabia.com/sudoku?date=2026-09-30',{'x-robots-tag':'noindex, follow'}),'/sudoku'),false);
  assert.equal(sandbox.isCacheableResponse(response('https://riddlearabia.com/sudoku?difficulty=hard',{'cache-control':'no-store'}),'/sudoku'),false);
  assert.equal(sandbox.isCacheableResponse(response('https://riddlearabia.com/sudoku'),'/sudoku'),true);
});
