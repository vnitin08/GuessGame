import { Field, Provable, Struct, UInt64, ZkProgram } from "o1js";
import { HiddenValue } from "./GuessGame";

export const LESS = UInt64.from(1);
export const EQUALS = UInt64.from(2);
export const GREATER = UInt64.from(3);

export class CheckProofPublicInput extends Struct({
    guessedNumber: Field,
}) {}
  
export class CheckProofPublicOutput extends Struct({
    clue: UInt64,
    hiddenValueHash: Field,
}) {}

export function check(
  publicInput: CheckProofPublicInput,
  hiddenValue: HiddenValue
): CheckProofPublicOutput {
  const guessedNumber = publicInput.guessedNumber;
  const hiddenGreater = hiddenValue.value.greaterThan(guessedNumber);
  const hiddenLess = hiddenValue.value.lessThan(guessedNumber);
  const hiddenEquals = hiddenValue.value.equals(guessedNumber);

  const clue = Provable.switch(
    [hiddenLess, hiddenEquals, hiddenGreater],
    UInt64,
    [LESS, EQUALS, GREATER]
  );
  const hiddenValueHash = hiddenValue.hash();

  return new CheckProofPublicOutput({
    clue,
    hiddenValueHash,
  });
}

export const CheckProgramm = ZkProgram({
    name: 'check-program',
    publicInput: CheckProofPublicInput,
    publicOutput: CheckProofPublicOutput,
    methods: {
      check: {
        privateInputs: [HiddenValue],
        async method(
          input: CheckProofPublicInput,
          hiddenValue: HiddenValue
        ): Promise<CheckProofPublicOutput> {
          return check(input, hiddenValue);
        },
      },
    },
});

export class CheckProof extends ZkProgram.Proof(CheckProgramm) {}