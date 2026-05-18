(function () {
  'use strict';
  JakhGameFactory.registerGrid({
    id: 'hex',
    size: 9,
    mode: 'drop',
    connect: true,
    aToken: 'A',
    bToken: 'B',
    rules: 'Player A connects top to bottom. Player B connects left to right. Build bridges and block paths.',
  });
})();
