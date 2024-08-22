import { Field, MerkleMap, MerkleMapWitness, method, Poseidon, Provable, SmartContract, State, state, Struct } from 'o1js';

export class HiddenValue extends Struct({
    value: Field,
    salt: Field,
  }) {
    hash(): Field {
      return Poseidon.hash([this.value, this.salt]);
    }
  }

export class GuessGame extends SmartContract {
    @state(Field) hiddenNumber = State<Field>();
    @state(Field) scoreRoot = State<Field>();
    @state(Field) guessedNumber = State<Field>();
    @state(Field) guesser = State<Field>();

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
    }

    @method async guessNumber(number: Field) {
        let curGuessedNumber = this.guessedNumber.getAndRequireEquals();
    
        curGuessedNumber.assertEquals(Field(0), "You have already guessed number");
    
        const sender = this.sender.getAndRequireSignature();
        const senderHash = Poseidon.hash(sender.toFields());
    
        this.guessedNumber.set(number);
        this.guesser.set(senderHash);
    }

    @method async revealNumber(
        hiddenValue: HiddenValue,
        score: Field,
        scoreWitness: MerkleMapWitness
      ) {
        // Check hidden value
        let currentHiddenNumber = this.hiddenNumber.getAndRequireEquals();
        currentHiddenNumber.assertEquals(
          hiddenValue.hash(),
          'It is not hidden number'
        );
    
        // Check score witness
        const [prevScoreRoot, key] = scoreWitness.computeRootAndKeyV2(score);
    
        this.scoreRoot
          .getAndRequireEquals()
          .assertEquals(prevScoreRoot, 'Wrong score witness');
    
        const guesserHash = this.guesser.getAndRequireEquals();
        key.assertEquals(guesserHash, 'Witness for wrong user');
    
        // Check guess
        const guessedNumber = this.guessedNumber.getAndRequireEquals();
        const scoreDiff = Provable.if(
          hiddenValue.value.equals(guessedNumber),
          Field(1),
          Field(0)
        );
    
        const [newScoreRoot] = scoreWitness.computeRootAndKeyV2(
          score.add(scoreDiff)
        );
    
        this.scoreRoot.set(newScoreRoot);
        this.hiddenNumber.set(Field(0));
        this.guessedNumber.set(Field(0));
        this.guesser.set(Field(0));
    }
}

