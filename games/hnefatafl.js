(function () {
  'use strict';
  const start = [[24, 'AK']];
  [2, 7, 10, 14, 17, 20, 22, 26, 28, 31, 34, 38, 41, 46].forEach(i => start.push([i, 'B']));
  [18, 23, 24, 25, 30].forEach(i => { if (i !== 24) start.push([i, 'A']); });
  JakhGameFactory.registerGrid({
    id: 'hnefatafl',
    size: 7,
    start,
    maxStep: 7,
    directions: [[1,0],[-1,0],[0,1],[0,-1]],
    aToken: 'K',
    bToken: 'B',
    rules: 'The king side tries to escape across open lines while attackers reduce the defenders. Capture by landing on opposing pieces.',
  });
})();
