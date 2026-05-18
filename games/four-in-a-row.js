(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'four-in-a-row',
    rows: 6,
    cols: 7,
    mode: 'drop',
    gravity: true,
    winLength: 4,
    aToken: 'A',
    bToken: 'B',
    rules: 'Drop a disc into a column. Connect four horizontally, vertically, or diagonally before your opponent.',
  });
})();
