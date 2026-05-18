(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'dots-and-boxes',
    rows: 5,
    cols: 5,
    mode: 'drop',
    aToken: 'A',
    bToken: 'B',
    rules: 'Claim grid spaces and time the final chain. When the grid fills, the side with more claimed boxes wins.',
  });
})();
