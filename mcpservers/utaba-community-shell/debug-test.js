import { spawn } from 'child_process';
import readline from 'readline';

console.log('Starting MCP server...');
const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: true
});

server.stdout.on('data', (data) => {
  console.log('📤 Server Response:');
  console.log(data.toString());
});

server.stderr.on('data', (data) => {
  console.log('❌ Server Error:');
  console.log(data.toString());
});

// Send test commands
const commands = [
  //'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}',
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcp_shell_execute_command","arguments":{"command":"npm","args":["run","build"],"workingDirectory":"projects/utaba-community/mcpservers/utaba-community-shell"}}}'
];

commands.forEach((cmd, i) => {
  setTimeout(() => {
    console.log(`📥 Sending command ${i + 1}:`);
    console.log(cmd);
    server.stdin.write(cmd + '\n');
  }, i * 2000);
});

// Clean shutdown
// Read from the console and forward input to the server

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Type your JSON-RPC command and press Enter. Type "exit" to quit.');

rl.on('line', (input) => {
  if (input.trim().toLowerCase() === 'exit') {
    server.kill();
    rl.close();
    process.exit(0);
  } else {
    server.stdin.write(input + '\n');
  }
});