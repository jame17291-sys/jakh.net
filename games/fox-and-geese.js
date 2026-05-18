(function () {
  'use strict';
  const start = [[12, 'A']];
  for (let i = 0; i < 10; i += 1) start.push([i, 'B']);
  JakhGameFactory.registerGrid({
    id: 'fox-and-geese',
    size: 5,
    start,
    directions: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    aToken: 'F',
    bToken: 'G',
    rules: 'The fox tries to break through while the geese surround it. Capture by landing on opposing pieces.',
  });
})();
