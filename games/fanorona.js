(function () {
  'use strict';
  const start = [];
  for (let i = 0; i < 18; i += 1) start.push([i, 'B']);
  for (let i = 27; i < 45; i += 1) start.push([i, 'A']);
  JakhGameFactory.registerGrid({
    id: 'fanorona',
    rows: 5,
    cols: 9,
    start,
    directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    aToken: 'A',
    bToken: 'B',
    rules: 'Use approach-style movement on a dense board. Capture by moving into an opposing piece and reduce the enemy force.',
  });
})();
