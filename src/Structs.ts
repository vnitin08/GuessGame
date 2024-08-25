import { Field, Poseidon, Struct } from 'o1js';

export class HiddenValue extends Struct({
  value: Field,
  salt: Field,
}) {
  hash(): Field {
    return Poseidon.hash([this.value, this.salt]);
  }
}