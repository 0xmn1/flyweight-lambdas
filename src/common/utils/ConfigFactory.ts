import aws from 'aws-sdk';
import fs from 'fs';

export default class ConfigFactory {
  async createDecryptedConfig<TConfig>(configPath: string): Promise<TConfig> {
    let config = null;
    try {
      const kms = new aws.KMS({ 'region': 'ap-northeast-1' });
      const params = {
        CiphertextBlob: fs.readFileSync(configPath)
      };

      const data = await kms.decrypt(params).promise();
      const text = data?.Plaintext?.toString();
      if (!text) {
        throw 'Failed to get decrypted config text';
      }

      return JSON.parse(text);
    } catch (err: unknown) {
      console.error(err);
      throw err;
    }
  }
}
