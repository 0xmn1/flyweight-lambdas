import { AwsLambdaEvent } from '../common/types/AwsLambdaEvent';
import { Config } from './types/Config';
import ConfigFactory from '../common/utils/ConfigFactory';
import DepositOracleNode from './classes/DepositOracleNode';
import path from 'path';

exports.handler = async (event: AwsLambdaEvent) => {
  const address = event.headers['X-Address'] || event.headers['x-address'];
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return {
      statusCode: 400,
      body: `Invalid x-address header, x-address=${address}`
    };
  }

  try {
    console.log(`fetching order ids for address, address=${address}`);
    const configFactory = new ConfigFactory();
    const configPath = path.resolve(__dirname, 'env-secrets-encrypted.json');
    const config = await configFactory.createDecryptedConfig<Config>(configPath, 'ap-northeast-1');
    const node = new DepositOracleNode(config);
    await node.runOracleNode(address);
  } catch (err) {
    console.error(err);
    return { statusCode: 500 };
  }

  return { statusCode: 200 };
};
