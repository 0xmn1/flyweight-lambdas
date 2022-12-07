export type Config = {
  oracleContractAddress: string;
  apiKeyAlchemy: string;
  apiKeyCoinMarketCap: string;
  privateKey: string;
  network: string;
};

export const createDecryptedConfig = async (): Promise<Config> => {
  let config = null;
  try {
    const kms = new aws.KMS({ 'region': 'ap-northeast-1' });
    const params = {
      CiphertextBlob: fs.readFileSync('env-secrets-encrypted.json')
    };

    const data = await kms.decrypt(params).promise();
    return JSON.parse(data['Plaintext'].toString());
  } catch (err: unknown) {
    console.error(err);
    throw err;
  }
};
