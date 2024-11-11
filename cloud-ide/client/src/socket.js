import { io } from 'socket.io-client';

const socket = io('http://localhost:9000');

// Handle room join
export const joinRoom = (room, userName) => {
  socket.emit('join:room', { room, userName });
};

// Listen for file changes and broadcast them to the room
export const fileChange = (data) => {
  socket.emit('file:change', data);
};

// Listen for file refresh
export const fileRefresh = (callback) => {
  socket.on('file:refresh', callback);
};

// Listen for file updates and apply changes
export const fileUpdate = (callback) => {
  socket.on('file:update', callback);
};

// Listen for users joining the room (optional: for room notifications)
export const userJoinedRoom = (callback) => {
  socket.on('user:joined', callback);
};

export default socket;
