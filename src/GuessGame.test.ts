import { AccountUpdate, Field, MerkleMap, Mina, Poseidon, PrivateKey, PublicKey } from 'o1js';
import { GuessGame, HiddenValue } from './GuessGame';
import { Pickles } from 'o1js/dist/node/snarky';
import { dummyBase64Proof } from 'o1js/dist/node/lib/proof-system/zkprogram';
import { check, CheckProof, CheckProofPublicInput, EQUALS, GREATER, LESS } from './CheckProof';

export async function mockProof<I, O, P>(
  publicOutput: O,
  ProofType: new ({
    proof,
    publicInput,
    publicOutput,
    maxProofsVerified,
  }: {
    proof: unknown;
    publicInput: I;
    publicOutput: any;
    maxProofsVerified: 0 | 2 | 1;
  }) => P,
  publicInput: I
): Promise<P> {
  const [, proof] = Pickles.proofOfBase64(await dummyBase64Proof(), 2);
  return new ProofType({
    proof: proof,
    maxProofsVerified: 2,
    publicInput,
    publicOutput,
  });
}

let proofsEnabled = false;

describe('Test', () => {
  let deployerAccount: Mina.TestPublicKey,
    deployerKey: PrivateKey,
    senderAccount: Mina.TestPublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: GuessGame;

  beforeAll(async () => {
    if (proofsEnabled) await GuessGame.compile();
  });

  beforeEach(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    [deployerAccount, senderAccount] = Local.testAccounts;
    deployerKey = deployerAccount.key;
    senderKey = senderAccount.key;

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new GuessGame(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('our test', async () => {
    await localDeploy();

    const scoreMerkleMap = new MerkleMap();
    const hiddenNumber = Field(9);
    const wrongNumber = Field(5);
    const senderHash = Poseidon.hash(senderAccount.toFields());
    const hiddenValue = new HiddenValue({
      value: hiddenNumber,
      salt: Field.random(),
    });

    // Hide number
    let tx = Mina.transaction(senderAccount, async () => {
      await zkApp.hideNumber(hiddenValue); // !
    });

    await tx.prove();
    await tx.sign([senderKey]).send();

    // Try to guess wrong number
    // let score = scoreMerkleMap.get(senderHash);
    // let scoreWitness = scoreMerkleMap.getWitness(senderHash);

    // await expect(async () => {
    //   let tx2 = await Mina.transaction(senderAccount, async () => {
    //     await zkApp.guessNumber(wrongNumber, score, scoreWitness);
    //   });

    //   await tx2.prove();
    //   await tx2.sign([senderKey]).send();
    // }).rejects.toThrow('Other numbre was guessed');

    // Guess lower number
    let guess1 = hiddenNumber.sub(1);
    let tx3 = await Mina.transaction(senderAccount, async () => {
      await zkApp.guessNumber(guess1);
    });

    await tx3.prove();
    await tx3.sign([senderKey]).send();

    let checkProof1PublicInput = new CheckProofPublicInput({
      guessedNumber: guess1,
    });
    let checkProof1PublicOutput = check(checkProof1PublicInput, hiddenValue);
    let checkProof1 = await mockProof(
      checkProof1PublicOutput,
      CheckProof,
      checkProof1PublicInput
    );

    let tx4 = await Mina.transaction(senderAccount, async () => {
      await zkApp.checkValue(checkProof1);
    });

    await tx4.prove();
    await tx4.sign([senderKey]).send();

    let curClue = zkApp.clue.get();
    expect(curClue).toEqual(GREATER);

    // Guess higher number
    let guess2 = hiddenNumber.add(1);
    let tx5 = await Mina.transaction(senderAccount, async () => {
      await zkApp.guessNumber(guess2);
    });

    await tx5.prove();
    await tx5.sign([senderKey]).send();

    let checkProof2PublicInput = new CheckProofPublicInput({
      guessedNumber: guess2,
    });
    let checkProof2PublicOutput = check(checkProof2PublicInput, hiddenValue);
    let checkProof2 = await mockProof(
      checkProof2PublicOutput,
      CheckProof,
      checkProof2PublicInput
    );

    let tx6 = await Mina.transaction(senderAccount, async () => {
      await zkApp.checkValue(checkProof2);
    });

    await tx6.prove();
    await tx6.sign([senderKey]).send();

    curClue = zkApp.clue.get();
    expect(curClue).toEqual(LESS);    

    // Guess right number
    let tx7 = await Mina.transaction(senderAccount, async () => {
      await zkApp.guessNumber(hiddenNumber);
    });

    await tx7.prove();
    await tx7.sign([senderKey]).send();

    let checkProof3PublicInput = new CheckProofPublicInput({
      guessedNumber: hiddenNumber,
    });
    let checkProof3PublicOutput = check(checkProof3PublicInput, hiddenValue);
    let checkProof3 = await mockProof(
      checkProof3PublicOutput,
      CheckProof,
      checkProof3PublicInput
    );

    let tx8 = await Mina.transaction(senderAccount, async () => {
      await zkApp.checkValue(checkProof3);
    });

    await tx8.prove();
    await tx8.sign([senderKey]).send();

    curClue = zkApp.clue.get();
    expect(curClue).toEqual(EQUALS);

    // Update score
    let score = scoreMerkleMap.get(senderHash);
    let scoreWitness = scoreMerkleMap.getWitness(senderHash);

    let tx9 = await Mina.transaction(senderAccount, async () => {
      await zkApp.updateScore(score, scoreWitness);
    });

    await tx9.prove();
    await tx9.sign([senderKey]).send();

    scoreMerkleMap.set(senderHash, score.add(1));

    // Check onchain values
    let curHiddenValue = zkApp.hiddenNumber.get();
    let curScoreRoot = zkApp.scoreRoot.get();

    expect(curHiddenValue).toEqual(Field(0)); // It should be updated after right guess
    expect(curScoreRoot).toEqual(scoreMerkleMap.getRoot());
  });
});