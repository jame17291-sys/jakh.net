(function () {
  'use strict';
  const start = [];
  for (let i = 0; i < 10; i += 1) start.push([i, 'B']);
  for (let i = 15; i < 25; i += 1) start.push([i, 'A']);
  JakhGameFactory.registerGrid({
    id: 'alquerque',
    size: 5,
    start,
    directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    aToken: 'A',
    bToken: 'B',
    rules: 'Move along the grid and diagonals. Capture opposing pieces by landing on them; remove the enemy force to win.',
  });
})();
