import { Field, MerkleMap, MerkleMapWitness, method, Poseidon, SmartContract, State, state } from 'o1js';

export class GuessGame extends SmartContract {
    @state(Field) hiddenNumber = State<Field>();
    @state(Field) scoreRoot = State<Field>();

    init() {
        super.init();

        this.scoreRoot.set(new MerkleMap().getRoot());
    }

    @method async hideNumber(number: Field) {
        let curHiddenNumber = this.hiddenNumber.getAndRequireEquals();

        curHiddenNumber.assertEquals(Field(0), 'Number is already hidden');

        number.assertLessThan(Field(100), 'Value should be less then 100');

        this.hiddenNumber.set(Poseidon.hash([number]));
    }

    @method async guessNumber(
        number: Field,
        score: Field,
        scoreWitness: MerkleMapWitness
    ) {
        let curHiddenNumber = this.hiddenNumber.getAndRequireEquals();

        curHiddenNumber.assertEquals(
        Poseidon.hash([number]),
        'Other number was guessed'
        );

        // Check witnessed value
        const [prevScoreRoot, key] = scoreWitness.computeRootAndKeyV2(score);

        this.scoreRoot
        .getAndRequireEquals()
        .assertEquals(prevScoreRoot, 'Wrong score witness');

        const sender = this.sender.getAndRequireSignature();
        const senderHash = Poseidon.hash(sender.toFields());
        key.assertEquals(senderHash, 'Witness for wrong user');

        const [newScoreRoot] = scoreWitness.computeRootAndKeyV2(score.add(1));

        this.scoreRoot.set(newScoreRoot);
        this.hiddenNumber.set(Field(0));
    };
}

