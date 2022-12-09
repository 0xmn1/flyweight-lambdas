import { Contract, ContractInterface, Signer, ethers, providers } from 'ethers';

import fs from 'fs';

export default class ContractFactory {
  constructor(
    private readonly _network: string,
    private readonly _address: string,
    private readonly _alchemyPublicKey: string,
    private readonly _signerPrivateKey: string
  ) {
  }

  createContractReadOnly(): Contract {
    const provider = new ethers.providers.AlchemyProvider(this._network, this._alchemyPublicKey);
    return this.createContract(provider);
  }

  createContractWrite(): Contract {
    const provider = new ethers.providers.AlchemyProvider(this._network, this._alchemyPublicKey);
    const signer = new ethers.Wallet(this._signerPrivateKey, provider);
    return this.createContract(signer);
  }

  private createContract(signerOrProvider: Signer | providers.Provider): Contract {
    const abi: ContractInterface = JSON.parse(fs.readFileSync('oracle-smart-contract-abi.json', 'utf8'));
    return new ethers.Contract(this._address, abi, signerOrProvider);
  }
}
