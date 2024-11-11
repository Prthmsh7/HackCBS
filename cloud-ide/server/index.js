const http = require('http');
const express = require('express');
const fs = require('fs/promises');
const { Server: SocketServer } = require('socket.io');
const path = require('path');
const cors = require('cors');
const chokidar = require('chokidar');
const pty = require('node-pty');

const app = express();
const server = http.createServer(app);
const io = new SocketServer({
    cors: '*'
});

app.use(cors());

io.attach(server);

const rooms = {}; // Store room data (users, file content)
const userColors = {}; // Store user colors by socket ID

// Random color generator for users
const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
};

const ptyProcess = pty.spawn('bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.INIT_CWD + '/user',
    env: process.env
});

// Watch for changes in files
chokidar.watch('./user').on('all', (event, path) => {
    io.emit('file:refresh', path);
});

// Listen for terminal data
ptyProcess.onData(data => {
    io.emit('terminal:data', data);
});

// Handle new socket connections
io.on('connection', (socket) => {
    console.log(`Socket connected`, socket.id);

    // Assign a random color when the user connects
    const userColor = getRandomColor();
    userColors[socket.id] = userColor;
    socket.emit('user:color', userColor); // Send the color to the user

    // Send the file tree when a user connects
    socket.emit('file:refresh');

    // Handle file change events
    socket.on('file:change', async ({ path, content, room }) => {
        // Save the file content on the server
        await fs.writeFile(`./user${path}`, content);

        // Broadcast the file change to everyone in the same room, along with the user's color
        socket.to(room).emit('file:update', { path, content, color: userColors[socket.id] });
    });

    // Handle user joining a room
    socket.on('join:room', ({ room, userName }) => {
        socket.join(room);

        // If the room doesn't exist, initialize it
        if (!rooms[room]) {
            rooms[room] = { users: [], files: {} };
        }

        // Add the user to the room
        rooms[room].users.push({ userName, color: userColors[socket.id] });

        // Notify others in the room that a user has joined
        socket.to(room).emit('user:joined', `${userName} has joined the room`);

        // Send the file tree of the room
        socket.emit('file:refresh', rooms[room].files);
    });

    // Listen for terminal write requests
    socket.on('terminal:write', (data) => {
        console.log('Term', data);
        ptyProcess.write(data);
    });

    // Handle disconnect events (cleanup room data)
    socket.on('disconnect', () => {
        for (let room in rooms) {
            const userIndex = rooms[room].users.findIndex(user => user.socketId === socket.id);
            if (userIndex !== -1) {
                rooms[room].users.splice(userIndex, 1);
                socket.to(room).emit('user:left', `A user has left the room`);
            }
        }
        // Remove the user's color mapping
        delete userColors[socket.id];
    });
});

// Get file tree
app.get('/files', async (req, res) => {
    const fileTree = await generateFileTree('./user');
    return res.json({ tree: fileTree });
});

// Get file content
app.get('/files/content', async (req, res) => {
    const filePath = req.query.path;
    const content = await fs.readFile(`./user${filePath}`, 'utf-8');
    return res.json({ content });
});

// Start the server
server.listen(9000, () => console.log('🐳 Docker server running on port 9000'));

// Function to generate file tree
async function generateFileTree(directory) {
    const tree = {};

    async function buildTree(currentDir, currentTree) {
        const files = await fs.readdir(currentDir);

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory()) {
                currentTree[file] = {};
                await buildTree(filePath, currentTree[file]);
            } else {
                currentTree[file] = null;
            }
        }
    }

    await buildTree(directory, tree);
    return tree;
}
