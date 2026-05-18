(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'gomoku',
    size: 15,
    mode: 'drop',
    winLength: 5,
    aToken: 'A',
    bToken: 'B',
    rules: 'Place stones on empty points. The first side to create five in a row wins.',
  });
})();
