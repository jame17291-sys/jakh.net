(function () {
  'use strict';
  const start = [];
  for (let i = 0; i < 36; i += 1) {
    if (i === 14 || i === 21) continue;
    start.push([i, i % 2 ? 'A' : 'B']);
  }
  JakhGameFactory.registerGrid({
    id: 'konane',
    size: 6,
    start,
    directions: [[2,0],[-2,0],[0,2],[0,-2]],
    aToken: 'A',
    bToken: 'B',
    rules: 'Jump in straight lines and remove opposing options. This small-board edition trains move economy and tempo.',
  });
})();
