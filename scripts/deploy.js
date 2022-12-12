import async from 'async';
import { exec } from 'child_process';

var nodeArgs = process.argv.slice(2);
const zipPath = nodeArgs[0];
const lambdaFunctionName = nodeArgs[1];
if (!zipPath) {
  throw 'Missing node argument: zipPath';
}
if (!lambdaFunctionName) {
  throw 'Missing node argument: lambdaFunctionName';
}

const execCommand = (callback, cmd) => exec(cmd, (err, res) => {
  if (err !== undefined && err !== null) {
    throw err;
  } else {
    callback();
  }
});

const cmd = `npx aws lambda update-function-code --function-name ${lambdaFunctionName} --zip-file fileb://${zipPath}`;
const npxPipeline = [
  callback => execCommand(callback, cmd),
];

async.series(npxPipeline, (err, result) => {
  if (err) {
    console.error(err);
  } else {
    console.log('deploy finished');
  }
});
