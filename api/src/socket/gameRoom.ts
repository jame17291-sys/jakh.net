import { Server as SocketServer, Socket } from 'socket.io';

interface GameRoom {
  id: string;
  hostSocketId: string;
  players: Map<string, { name: string; socketId: string }>;
  category: string;
  createdAt: number;
}

const rooms = new Map<string, GameRoom>();

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id: string;
  do {
    id = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(id));
  return id;
}

// Purge rooms older than 2 hours every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  rooms.forEach((room, id) => {
    if (room.createdAt < cutoff) rooms.delete(id);
  });
}, 10 * 60 * 1000);

export function setupGameRooms(io: SocketServer) {
  io.on('connection', (socket: Socket) => {

    socket.on('createRoom', ({ playerName = 'Host', category = '' }: { playerName?: string; category?: string }) => {
      const roomId = generateRoomId();
      const playerId = socket.id;
      const room: GameRoom = {
        id: roomId,
        hostSocketId: socket.id,
        players: new Map([[playerId, { name: playerName, socketId: socket.id }]]),
        category,
        createdAt: Date.now(),
      };
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.emit('roomCreated', {
        roomId,
        playerId,
        url: `https://jakh.net/play/${roomId}`,
        players: Array.from(room.players.values()),
      });
    });

    socket.on('joinRoom', ({ roomId, playerName = 'Guest' }: { roomId: string; playerName?: string }) => {
      const room = rooms.get(roomId.toUpperCase());
      if (!room) { socket.emit('error', { message: 'Room not found or expired' }); return; }
      if (room.players.size >= 20) { socket.emit('error', { message: 'Room is full' }); return; }
      const playerId = socket.id;
      room.players.set(playerId, { name: playerName, socketId: socket.id });
      socket.join(roomId.toUpperCase());
      const playerList = Array.from(room.players.values());
      socket.emit('roomJoined', { roomId: room.id, playerId, players: playerList, hostId: room.hostSocketId });
      socket.to(room.id).emit('playerJoined', { playerId, playerName, players: playerList });
    });

    // Generic relay — host or any player forwards events to everyone else in the room
    socket.on('relay', ({ roomId, event, data }: { roomId: string; event: string; data: unknown }) => {
      const room = rooms.get(roomId?.toUpperCase());
      if (!room || !room.players.has(socket.id)) return;
      socket.to(room.id).emit('relayed', { event, data, from: socket.id });
    });

    socket.on('disconnecting', () => {
      socket.rooms.forEach((roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const player = room.players.get(socket.id);
        room.players.delete(socket.id);
        if (room.players.size === 0) { rooms.delete(roomId); return; }
        // Transfer host if host left
        if (room.hostSocketId === socket.id) {
          room.hostSocketId = room.players.keys().next().value!;
        }
        socket.to(roomId).emit('playerLeft', {
          playerId: socket.id,
          playerName: player?.name,
          newHostId: room.hostSocketId,
          players: Array.from(room.players.values()),
        });
      });
    });
  });
}
