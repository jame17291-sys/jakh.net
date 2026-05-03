/**
 * JakhRoom — shared WebSocket multiplayer IIFE
 * Exposes window.JakhRoom
 */
(function () {
  'use strict';

  const SOCKET_URL = 'wss://jakh.net';
  const SOCKET_PATH = '/socket.io';
  const CDN = 'https://cdn.socket.io/4.8.1/socket.io.min.js';

  let socket = null;
  let _roomId = null;
  let _playerId = null;
  let _gameName = null;

  // Callbacks
  const _onMoveCbs = [];
  const _onPlayerJoinedCbs = [];
  const _onPlayerLeftCbs = [];

  // ── Script loader ──────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  // ── Connect socket ─────────────────────────────────────
  function connect() {
    return new Promise(function (resolve, reject) {
      if (socket && socket.connected) { resolve(); return; }

      socket = io(SOCKET_URL, {
        path: SOCKET_PATH,
        transports: ['websocket', 'polling'],
      });

      socket.once('connect', function () { resolve(); });
      socket.once('connect_error', function (err) { reject(err); });

      // ── Permanent event listeners ──────────────────────
      socket.on('relayed', function (payload) {
        if (payload.from === socket.id) return; // ignore own echoes
        _onMoveCbs.forEach(function (fn) { fn(payload.data); });
      });

      socket.on('playerJoined', function (payload) {
        _onPlayerJoinedCbs.forEach(function (fn) {
          fn(payload.playerName, payload.players);
        });
      });

      socket.on('playerLeft', function (payload) {
        _onPlayerLeftCbs.forEach(function (fn) {
          fn(payload.playerName, payload.players);
        });
      });

      socket.on('error', function (payload) {
        console.warn('[JakhRoom] server error:', payload.message);
      });
    });
  }

  // ── init ───────────────────────────────────────────────
  function init(gameName) {
    _gameName = gameName || 'game';

    return loadScript(CDN).then(function () {
      return connect();
    }).then(function () {
      // Auto-join if ?room=XXXX in URL
      var params = new URLSearchParams(window.location.search);
      var roomParam = params.get('room');
      if (roomParam) {
        return join(roomParam, 'Guest');
      }
    });
  }

  // ── create ─────────────────────────────────────────────
  function create(playerName) {
    return new Promise(function (resolve, reject) {
      if (!socket || !socket.connected) {
        reject(new Error('Not connected. Call JakhRoom.init() first.'));
        return;
      }

      socket.once('roomCreated', function (payload) {
        _roomId = payload.roomId;
        _playerId = payload.playerId;

        // Update browser URL without reload
        var url = payload.url || (window.location.origin + window.location.pathname + '?room=' + _roomId);
        history.replaceState(null, '', '?room=' + _roomId);

        // Copy link to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).catch(function () {});
        }

        resolve({ roomId: _roomId, url: url });
      });

      socket.once('error', function (payload) {
        reject(new Error(payload.message));
      });

      socket.emit('createRoom', {
        playerName: playerName || 'Host',
        category: _gameName,
      });
    });
  }

  // ── join ───────────────────────────────────────────────
  function join(roomId, playerName) {
    return new Promise(function (resolve, reject) {
      if (!socket || !socket.connected) {
        reject(new Error('Not connected. Call JakhRoom.init() first.'));
        return;
      }

      socket.once('roomJoined', function (payload) {
        _roomId = payload.roomId;
        _playerId = payload.playerId;
        resolve(payload);
      });

      socket.once('error', function (payload) {
        reject(new Error(payload.message));
      });

      socket.emit('joinRoom', {
        roomId: roomId,
        playerName: playerName || 'Guest',
      });
    });
  }

  // ── sendMove ───────────────────────────────────────────
  function sendMove(data) {
    if (!socket || !_roomId) return;
    socket.emit('relay', { roomId: _roomId, event: 'move', data: data });
  }

  // ── postScore ─────────────────────────────────────────
  function postScore(username, score, metadata) {
    if (!_gameName) return;
    fetch('https://jakh.net/api/boardgame/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: username || 'Anonymous', game: _gameName, score: score, metadata: metadata || {} }),
    }).catch(function () {});
  }

  // ── callback registration ──────────────────────────────
  function onMove(fn) { _onMoveCbs.push(fn); }
  function onPlayerJoined(fn) { _onPlayerJoinedCbs.push(fn); }
  function onPlayerLeft(fn) { _onPlayerLeftCbs.push(fn); }

  // ── accessors ──────────────────────────────────────────
  function mySocketId() { return socket ? socket.id : null; }
  function isConnected() { return !!(socket && socket.connected); }

  // ── Expose public API ──────────────────────────────────
  window.JakhRoom = {
    init: init,
    create: create,
    join: join,
    sendMove: sendMove,
    postScore: postScore,
    onMove: onMove,
    onPlayerJoined: onPlayerJoined,
    onPlayerLeft: onPlayerLeft,
    mySocketId: mySocketId,
    isConnected: isConnected,
    get roomId() { return _roomId; },
  };
})();
