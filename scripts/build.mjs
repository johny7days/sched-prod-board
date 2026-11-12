// Copies app/ to dist/ and stamps the build's git sha into the page (R6).
// sha: $BUILD_SHA (CI) or `git rev-parse HEAD`.
// session: $BOARD_SESSION (CI secret) or ../session.secret.txt (kept out of git). It still ends up in the
// deployed page, because the board sends it to the API as ?t= (see README).
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sha = process.env.BUILD_SHA || execSync('git rev-parse HEAD').toString().trim();
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const page = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', page);

const session = process.env.BOARD_SESSION || (existsSync('../session.secret.txt') && readFileSync('../session.secret.txt', 'utf8').trim());
if (!session) throw new Error('no session: set BOARD_SESSION or put it in ../session.secret.txt');
const config = readFileSync('dist/config.js', 'utf8').replace('<session from start-challenge>', session);
writeFileSync('dist/config.js', config);
console.log(`dist/ built at ${sha}`);
