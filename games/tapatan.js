(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'tapatan',
    size: 3,
    mode: 'drop',
    winLength: 3,
    aToken: 'A',
    bToken: 'B',
    rules: 'Place pieces on a three by three board. First side to make a straight line wins.',
  });
})();
