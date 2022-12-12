import archiver from 'archiver';
import async from 'async';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import fs from 'fs';

var nodeArgs = process.argv.slice(2);
const folderName = nodeArgs[0];
if (!folderName) {
  throw 'Missing node argument: folder name';
}

dotenv.config();

const writeAwsLambdaShim = (callback, folderName) => {
  const awsLambdaShim = `exports.handler = require("./${folderName}/index").handler;`;
  fs.writeFile('./build/index.js', awsLambdaShim, callback);
};

const createAwsLambdaZip = (callback, folderName) => {
  const output = fs.createWriteStream(`./build/${folderName}.zip`);
  const archive = archiver('zip');
  archive.on('error', err => { throw err; });
  archive.pipe(output);
  archive.glob(`common/**/*[.js|.json]`, { cwd: './build' });
  archive.glob(`${folderName}/**/*[.js|.json]`, { cwd: './build' });
  archive.glob('index.js', { cwd: './build' });
  archive.finalize();
  callback();
};

const execCommand = (callback, cmd) => exec(cmd, (err, res) => {
  if (err !== undefined && err !== null) {
    throw err;
  } else {
    callback();
  }
});

const npxPipeline = [
  callback => execCommand(callback, `npx tsc --alwaysStrict -p ./tsconfig.${folderName}.json`),
  callback => execCommand(callback, "npx aws kms encrypt --key-id '" + process.env.AWS_KMS_KEY_ID + `' --plaintext fileb://./src/${folderName}/env-secrets.json --output text --query CiphertextBlob --output text | base64 -D > ./build/${folderName}/env-secrets-encrypted.json`),
  callback => writeAwsLambdaShim(callback, folderName),
  callback => createAwsLambdaZip(callback, folderName),
];

fs.rmSync('./build', { recursive: true, force: true });
async.series(npxPipeline, (err, result) => {
  if (err) {
    console.error(err);
  } else {
    console.log('build finished');
  }
});
