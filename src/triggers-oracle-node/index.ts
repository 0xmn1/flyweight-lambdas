import { AwsLambdaEvent } from '../common/types/AwsLambdaEvent';
import { Config } from './types/Config';
import ConfigFactory from '../common/utils/ConfigFactory';
import TriggersOracleNode from './classes/TriggersOracleNode';

exports.handler = async (event: AwsLambdaEvent) => {
  console.log('run started');

  try {
    const configFactory = new ConfigFactory();
    const config = await configFactory.createDecryptedConfig<Config>('env-secrets-encrypted.json');
    await new TriggersOracleNode(config).tryTriggerOrders();
  } catch (err) {
    console.error(err);
    return { statusCode: 500 };
  }

  console.log('run finished');
  return { statusCode: 200 };
}
