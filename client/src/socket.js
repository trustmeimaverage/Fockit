import { io } from 'socket.io-client';

// Connects to same origin — proxied in dev, direct in production
const socket = io({ autoConnect: false, reconnectionDelay: 1000 });

export default socket;
