// Shared isolated score service for browser integration tests.
const net = require('node:net');
const {spawn} = require('node:child_process');

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const {port} = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startScoreService({python, root, database}) {
  const port = await freePort();
  const server = spawn(python, ['domestic-backend/server.py'], {
    cwd:root, env:{...process.env, QUIZ_DATABASE:database, QUIZ_PORT:String(port)},
    stdio:'ignore', windowsHide:true,
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/leaderboard`)).ok) return {server, port};
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  server.kill();
  throw new Error('Test score service did not start');
}

module.exports = {startScoreService};
