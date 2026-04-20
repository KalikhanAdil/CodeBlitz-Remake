import fs from 'fs/promises';
import { spawn, exec } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import util from 'util';

const execAsync = util.promisify(exec);
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure temp directory exists
fs.mkdir(TEMP_DIR, { recursive: true }).catch(console.error);

export async function executeCode(code, language, testCases, socket) {
    const uuid = crypto.randomUUID().replace(/-/g, '');
    let filepath, exePath, compileCmd, runCmd, runArgs;

    try {
        if (language === 'python') {
            filepath = path.join(TEMP_DIR, `code_${uuid}.py`);
            await fs.writeFile(filepath, code);
            runCmd = 'python3';
            runArgs = [filepath];
        } else if (language === 'javascript') {
            filepath = path.join(TEMP_DIR, `code_${uuid}.js`);
            await fs.writeFile(filepath, code);
            runCmd = 'node';
            runArgs = [filepath];
        } else if (language === 'cpp') {
            filepath = path.join(TEMP_DIR, `code_${uuid}.cpp`);
            exePath = path.join(TEMP_DIR, `exe_${uuid}`);
            await fs.writeFile(filepath, code);
            
            socket.emit('execution_update', { message: 'Compiling C++ code...' });
            await execAsync(`g++ -O2 ${filepath} -o ${exePath}`);
            runCmd = exePath;
            runArgs = [];
        } else if (language === 'java') {
            // Java requires the filename to match the public class name. Let's use 'Main'
            const javaDir = path.join(TEMP_DIR, `java_${uuid}`);
            await fs.mkdir(javaDir, { recursive: true });
            filepath = path.join(javaDir, 'Main.java');
            await fs.writeFile(filepath, code);
            
            socket.emit('execution_update', { message: 'Compiling Java code...' });
            await execAsync(`javac ${filepath}`);
            runCmd = 'java';
            runArgs = ['-cp', javaDir, 'Main'];
        } else if (language === 'rust') {
            filepath = path.join(TEMP_DIR, `code_${uuid}.rs`);
            exePath = path.join(TEMP_DIR, `exe_${uuid}`);
            await fs.writeFile(filepath, code);
            
            socket.emit('execution_update', { message: 'Compiling Rust code...' });
            await execAsync(`rustc ${filepath} -o ${exePath}`);
            runCmd = exePath;
            runArgs = [];
        } else {
            return { success: false, passedCount: 0, total: testCases.length };
        }
    } catch (err) {
        socket.emit('execution_update', { message: `Compilation Error ❌\n${err.stderr || err.message}` });
        return { success: false, passedCount: 0, total: testCases.length };
    }

    let allPassed = true;
    let passedCount = 0;
    
    socket.emit('execution_update', { message: `Started Execution (${language})...` });

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        socket.emit('execution_update', { message: `Running Test ${i + 1}/${testCases.length}...` });
        
        try {
            const output = await runTestCase(runCmd, runArgs, testCase.input);
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
            socket.emit('execution_update', { message: `Test ${i + 1}: Error ❌\n${error}` });
            break;
        }
    }

    // Cleanup
    try {
        if (filepath) await fs.unlink(filepath).catch(()=>{});
        if (exePath) await fs.unlink(exePath).catch(()=>{});
        if (language === 'java') await fs.rm(path.join(TEMP_DIR, `java_${uuid}`), { recursive: true, force: true }).catch(()=>{});
    } catch(e) {}

    return { success: allPassed, passedCount, total: testCases.length };
}

function runTestCase(command, args, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let output = '';
        let errorOutput = '';

        const timeout = setTimeout(() => {
            child.kill();
            reject('Execution Timed Out (5s)');
        }, 5000);

        child.stdout.on('data', (data) => output += data.toString());
        child.stderr.on('data', (data) => errorOutput += data.toString());

        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) reject(errorOutput || `Process exited with code ${code}`);
            else resolve(output);
        });

        if (input) {
            child.stdin.write(input);
            child.stdin.write('\n');
        }
        child.stdin.end();
    });
}
