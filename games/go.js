(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'go',
    size: 9,
    mode: 'drop',
    aToken: 'A',
    bToken: 'B',
    rules: 'Place stones on empty intersections. When the board fills, the side with more stones controls more territory and wins this compact educational edition.',
  });
})();
