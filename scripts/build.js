import { series } from 'async';
const { exec } = require('child_process');
require('dotenv').config();

const pipelineTasks = [
  // Encypt secrets
  "aws kms encrypt --key-id 'PUT_YOUR_AWS_KEY_ID_HERE' --plaintext fileb://./src/triggers-oracle-node/env-secrets.json --output text --query CiphertextBlob --output text | base64 -D > ./src/triggers-oracle-node/env-secrets-encrypted.json",
  "aws kms encrypt --key-id 'PUT_YOUR_AWS_KEY_ID_HERE' --plaintext fileb://./src/deposit-oracle-node/env-secrets.json --output text --query CiphertextBlob --output text | base64 -D > ./src/deposit-oracle-node/env-secrets-encrypted.json",
  // Create compile artifacts
  "tsc --alwaysStrict",
  // Create deployment artifacts
  "rm -f ./build/triggers-oracle-node/build.zip && mkdir -p ./build/triggers-oracle-node && zip -j ./build/triggers-oracle-node/build.zip ./src/triggers-oracle-node/index.js ./src/triggers-oracle-node/oracle-smart-contract-abi.json ./src/triggers-oracle-node/env-secrets-encrypted.json",
  "rm -f ./build/deposit-oracle-node/build.zip && mkdir -p ./build/deposit-oracle-node && zip -j ./build/deposit-oracle-node/build.zip ./src/deposit-oracle-node/index.js ./src/deposit-oracle-node/oracle-smart-contract-abi.json ./src/deposit-oracle-node/env-secrets-encrypted.json"
];

series([pipelineTasks]); 
