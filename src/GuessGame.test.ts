import { AccountUpdate, Field, MerkleMap, Mina, Poseidon, PrivateKey, PublicKey } from 'o1js';
import { GuessGame, HiddenValue } from './GuessGame';

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

    let tx3 = await Mina.transaction(senderAccount, async () => {
      await zkApp.guessNumber(hiddenNumber);
    });

    await tx3.prove();
    await tx3.sign([senderKey]).send();

    let score = scoreMerkleMap.get(senderHash);
    let scoreWitness = scoreMerkleMap.getWitness(senderHash);
    let tx4 = await Mina.transaction(senderAccount, async () => {
      await zkApp.revealNumber(hiddenValue, score, scoreWitness);
    });

    await tx4.prove();
    await tx4.sign([senderKey]).send();

    scoreMerkleMap.set(senderHash, score.add(1));

    // Check onchain values
    let curHiddenValue = zkApp.hiddenNumber.get();
    let curScoreRoot = zkApp.scoreRoot.get();

    expect(curHiddenValue).toEqual(Field(0)); // It should be updated after right guess
    expect(curScoreRoot).toEqual(scoreMerkleMap.getRoot());
  });
});