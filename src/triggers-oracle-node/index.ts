import TriggersOracleNode from './classes/TriggersOracleNode';
import { createDecryptedConfig } from './utils/configFactory';

exports.handler = async (event: unknown) => {
  console.log('run started');

  try {
    const config = await createDecryptedConfig();
    await new TriggersOracleNode(config).tryTriggerOrders();
  } catch (err) {
    console.error(err);
    return { statusCode: 500 };
  }

  console.log('run finished');
  return { statusCode: 200 };
}
