(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'reversi',
    size: 8,
    mode: 'drop',
    start: [[27, 'A'], [28, 'B'], [35, 'B'], [36, 'A']],
    aToken: 'A',
    bToken: 'B',
    rules: 'Place discs to build stable edges and corners. This educational edition scores final board control while preserving the core spatial pressure.',
  });
})();
