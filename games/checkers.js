(function () {
  'use strict';
  const start = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 8; c += 1) if ((r + c) % 2) start.push([r * 8 + c, 'B']);
  for (let r = 5; r < 8; r += 1) for (let c = 0; c < 8; c += 1) if ((r + c) % 2) start.push([r * 8 + c, 'A']);
  JakhGameFactory.registerGrid({
    id: 'checkers',
    size: 8,
    start,
    directions: [[1,1],[1,-1],[-1,1],[-1,-1]],
    aToken: 'A',
    bToken: 'B',
    rules: 'Move diagonally and capture by landing on an opposing piece. This browser edition emphasizes forced tactical reading on a clean board.',
  });
})();
