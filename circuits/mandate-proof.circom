pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

template MandateProof() {
    signal input maxAmount;
    signal input allowedMerchantHash;
    signal input amount;
    signal input merchantHash;
    signal output isValid;

    component amountCheck = LessEqThan(64);
    amountCheck.in[0] <== amount;
    amountCheck.in[1] <== maxAmount;

    component merchantCheck = IsEqual();
    merchantCheck.in[0] <== merchantHash;
    merchantCheck.in[1] <== allowedMerchantHash;

    isValid <== amountCheck.out * merchantCheck.out;
}

component main = MandateProof();
