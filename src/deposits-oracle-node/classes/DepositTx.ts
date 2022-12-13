export default class DepositTx {
  constructor(
    private readonly orderId: number,
    private readonly txHash: string,
  ) {
  }
}
