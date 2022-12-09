import { AwsLambdaEvent } from '../common/types/AwsLambdaEvent';
import { Config } from './types/Config';
import ConfigFactory from '../common/utils/ConfigFactory';
import DepositOracleNode from './classes/DepositOracleNode';

exports.handler = async (event: AwsLambdaEvent) => {
  const address = event.headers['X-Address'] || event.headers['x-address'];
  if (!address || address === '0x0000000000000000000000000000000000000000') {
    return {
      statusCode: 400,
      body: `Invalid x-address header, x-address=${address}`
    };
  }

  try {
    console.log(`Fetching order ids for address, address=${address}`);
    const configFactory = new ConfigFactory();
    const config = await configFactory.createDecryptedConfig<Config>('env-secrets-encrypted.json');
    const node = new DepositOracleNode(config);
    await node.runOracleNode(address);
  } catch (err) {
    console.error(err);
    return { statusCode: 500 };
  }

  return { statusCode: 200 };
};
