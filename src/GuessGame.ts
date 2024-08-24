import { Field, MerkleMap, MerkleMapWitness, method, Poseidon, Provable, SmartContract, State, state, Struct, UInt64 } from 'o1js';
import { CheckProof, EQUALS } from './CheckProof';

export class HiddenValue extends Struct({
    value: Field,
    salt: Field,
  }) {
    hash(): Field {
      return Poseidon.hash([this.value, this.salt]);
    }
  }

export const DefaultGuessLeft = UInt64.from(5);

export class GuessGame extends SmartContract {
    @state(Field) hiddenNumber = State<Field>();
    @state(Field) scoreRoot = State<Field>();
    @state(Field) guessedNumber = State<Field>();
    @state(Field) guesser = State<Field>();
    @state(UInt64) guessLeft = State<UInt64>();
    @state(UInt64) clue = State<UInt64>();

    init() {
        super.init();

        this.scoreRoot.set(new MerkleMap().getRoot());
    }

    @method async hideNumber(hiddenValue: HiddenValue) {
        let curHiddenNumber = this.hiddenNumber.getAndRequireEquals();
    
        curHiddenNumber.assertEquals(Field(0), 'Number is already hidden');
    
        hiddenValue.value.assertLessThan(
          Field(100),
          'Value should be less then 100'
        );
    
        this.hiddenNumber.set(hiddenValue.hash());
        this.guessLeft.set(DefaultGuessLeft);
    }

    @method async guessNumber(number: Field) {
        let curGuessLeft = this.guessLeft.getAndRequireEquals();
        let curGuesser = this.guesser.getAndRequireEquals();
        let curGuessedNumber = this.guessedNumber.getAndRequireEquals();
    
        curGuessedNumber.assertEquals(Field(0), "You have already guessed number");
        curGuessLeft.assertGreaterThan(UInt64.from(0), 'There is no more guesses');
    
        const sender = this.sender.getAndRequireSignature();
        const senderHash = Poseidon.hash(sender.toFields());

        const guesserCheck = curGuesser
          .equals(Field(0))
          .or(curGuesser.equals(senderHash));
        guesserCheck.assertTrue('Another user is guessing');

        this.guessLeft.set(curGuessLeft.sub(1));
        this.guessedNumber.set(number);
        this.guesser.set(senderHash);
    }

    @method async checkValue(checkProof: CheckProof) {
      const curHiddenNumber = this.hiddenNumber.getAndRequireEquals();
      const curGuessedNumber = this.guessedNumber.getAndRequireEquals();
  
      curGuessedNumber.assertGreaterThan(Field(0), 'No guessed number');
  
      checkProof.verify();
      checkProof.publicInput.guessedNumber.assertEquals(curGuessedNumber);
      checkProof.publicOutput.hiddenValueHash.assertEquals(curHiddenNumber);
  
      this.clue.set(checkProof.publicOutput.clue);
      this.guessedNumber.set(Field(0));
    }

    @method async updateScore(score: Field, scoreWitness: MerkleMapWitness) {
      let curGuessLeft = this.guessLeft.getAndRequireEquals();
      let currentHiddenNumber = this.hiddenNumber.getAndRequireEquals();
      let curClue = this.clue.getAndRequireEquals();
      let curScoreRoot = this.scoreRoot.getAndRequireEquals();

      currentHiddenNumber.assertGreaterThan(Field(0), 'No hidden value');
      curClue
            .equals(EQUALS)
            .or(curGuessLeft.equals(UInt64.zero))
            .assertTrue('Conditions are not met for update score');

      const [prevScoreRoot, key] = scoreWitness.computeRootAndKeyV2(score);

      curScoreRoot.assertEquals(prevScoreRoot, 'Wrong score witness');

      const guesserHash = this.guesser.getAndRequireEquals();
      key.assertEquals(guesserHash, 'Witness for wrong user');

      let scoreDiff = Provable.if(curClue.equals(EQUALS), Field(1), Field(0));

      const [newScoreRoot] = scoreWitness.computeRootAndKeyV2(
        score.add(scoreDiff)
      );

      this.scoreRoot.set(newScoreRoot);
      this.hiddenNumber.set(Field(0));
      this.guessedNumber.set(Field(0));
      this.guesser.set(Field(0));
    }
}

