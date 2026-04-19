import fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';

const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure temp directory exists
fs.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);

export async function executeCode(code, language, testCases, socket) {
    const ext = language === 'python' ? 'py' : 'js';
    const command = language === 'python' ? 'python' : 'node';
    
    const filename = `code_${crypto.randomUUID()}.${ext}`;
    const filepath = path.join(TEMP_DIR, filename);

    await fs.writeFile(filepath, code);

    let allPassed = true;
    let passedCount = 0;
    
    socket.emit('execution_update', { message: `Started Execution (${language})...` });

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        
        socket.emit('execution_update', { message: `Running Test ${i + 1}/${testCases.length}...` });
        
        try {
            const output = await runTestCase(command, filepath, testCase.input);
            const cleanOutput = output.trim();
            const cleanExpected = testCase.output.toString().trim();
            
            if (cleanOutput === cleanExpected) {
                passedCount++;
                socket.emit('execution_update', { message: `Test ${i + 1}: Passed ✅` });
            } else {
                allPassed = false;
                socket.emit('execution_update', { 
                    message: `Test ${i + 1}: Failed ❌\nExpected:\n${cleanExpected}\nGot:\n${cleanOutput}` 
                });
                break; // Stop on first failure
            }
        } catch (error) {
            allPassed = false;
            socket.emit('execution_update', { 
                message: `Test ${i + 1}: Error ❌\n${error}` 
            });
            break;
        }
    }

    // Cleanup
    try { await fs.unlink(filepath); } catch(e){}

    return { success: allPassed, passedCount, total: testCases.length };
}

function runTestCase(command, filepath, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, [filepath]);
        let output = '';
        let errorOutput = '';

        // Timeout 5 seconds to prevent infinite loops
        const timeout = setTimeout(() => {
            child.kill();
            reject('Execution Timed Out (5s)');
        }, 5000);

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                reject(errorOutput || `Process exited with code ${code}`);
            } else {
                resolve(output);
            }
        });

        // Write input to stdin and close it
        if (input) {
            child.stdin.write(input);
            child.stdin.write('\n'); // Ensure trailing newline
        }
        child.stdin.end();
    });
}
