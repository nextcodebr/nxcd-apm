import { ISink } from '../sink/api'
import { Transaction } from '../context/transaction'

export class RecordingSink implements ISink<Transaction> {
  txns: Transaction[] = []

  accept (txn: Transaction) {
    this.txns.push(txn)
  }

  get completed () {
    return this.txns.length
  }

  flush () {
    this.txns = []
  }

  pop (): Transaction {
    const txn = this.txns.pop()
    if (!txn) {
      throw new Error('Buffer Empty')
    }
    return txn
  }
}
