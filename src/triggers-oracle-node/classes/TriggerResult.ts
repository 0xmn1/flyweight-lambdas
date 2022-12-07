export default class TriggerResult {
  constructor(
    public readonly orderId: number,
    public readonly coinSymbol: string,
    public readonly coinPrice: string,
    public readonly isTriggered: boolean
  ) {
  }
}
