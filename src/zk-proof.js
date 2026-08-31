const snarkjs = require('snarkjs');
const { createHash } = require('crypto');
const path = require('path');
const fs = require('fs');

// Chemins vers les artefacts ZK
const CIRCUIT_WASM = path.join(__dirname, '../circuits/compiled/mandate-proof.wasm');
const ZKEY_PATH = path.join(__dirname, '../circuits/compiled/mandate-proof_final.zkey');
const VKEY_PATH = path.join(__dirname, '../circuits/compiled/verification_key.json');

/**
 * Hash un nom de marchand en nombre (pour le circuit ZK)
 * Prend les 8 premiers caractères du SHA-256 et convertit en entier
 */
function hashMerchant(merchantName) {
    const hash = createHash('sha256').update(merchantName.toLowerCase()).digest('hex');
    return BigInt('0x' + hash.substring(0, 16)).toString();
}

/**
 * Génère une preuve ZK qu'une action respecte un mandat
 * 
 * @param {Object} mandate - Le mandat (permissions)
 * @param {number} mandate.maxAmount - Montant maximum autorisé
 * @param {string[]} mandate.allowedMerchants - Liste des marchands autorisés
 * @param {Object} action - L'action à vérifier
 * @param {number} action.amount - Montant de l'action
 * @param {string} action.merchant - Marchand cible
 * @returns {Promise<Object>} La preuve ZK et les signaux publics
 */
async function generateMandateProof(mandate, action) {
    try {
        // Vérifier que les fichiers existent
        if (!fs.existsSync(CIRCUIT_WASM)) {
            throw new Error(`Fichier WASM introuvable: ${CIRCUIT_WASM}`);
        }
        if (!fs.existsSync(ZKEY_PATH)) {
            throw new Error(`Fichier ZKEY introuvable: ${ZKEY_PATH}`);
        }

        // Préparer les inputs pour le circuit
        const input = {
            maxAmount: mandate.maxAmount.toString(),
            allowedMerchantHash: hashMerchant(mandate.allowedMerchants[0]),
            amount: action.amount.toString(),
            merchantHash: hashMerchant(action.merchant)
        };

        console.log('🔐 Génération de la preuve ZK...');
        console.log('Inputs privés:', {
            maxAmount: input.maxAmount,
            allowedMerchantHash: input.allowedMerchantHash.substring(0, 10) + '...'
        });
        console.log('Inputs publics:', {
            amount: input.amount,
            merchantHash: input.merchantHash.substring(0, 10) + '...'
        });

        // Générer la preuve
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            CIRCUIT_WASM,
            ZKEY_PATH
        );

        console.log('✅ Preuve générée avec succès');

        return {
            proof: proof,
            publicSignals: publicSignals,
            input: input // Pour debug
        };
    } catch (error) {
        console.error('❌ Erreur génération preuve:', error.message);
        throw error;
    }
}

/**
 * Vérifie une preuve ZK
 * 
 * @param {Object} proof - La preuve ZK
 * @param {string[]} publicSignals - Les signaux publics
 * @returns {Promise<boolean>} true si la preuve est valide
 */
async function verifyMandateProof(proof, publicSignals) {
    try {
        // Charger la clé de vérification
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, 'utf8'));
        
        // 1. Vérifier la preuve cryptographique (le calcul a été fait correctement)
        const isProofValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        
        // 2. Vérifier que la logique métier accepte l'action (le signal output isValid vaut 1)
        // Dans circom, les outputs publics sont les premiers éléments du tableau publicSignals
        const isMandateRespected = publicSignals[0] === "1";
        
        const finalResult = isProofValid && isMandateRespected;
        
        console.log(finalResult ? '✅ Preuve valide (Mandat respecté)' : '❌ Preuve invalide (Mandat non respecté)');
        
        return finalResult;
    } catch (error) {
        console.error('❌ Erreur vérification preuve:', error.message);
        throw error;
    }
}

/**
 * Exporte une preuve au format JSON (pour API)
 */
function exportProof(proof, publicSignals, metadata = {}) {
    return {
        type: 'zk-snark-groth16',
        curve: 'bn128',
        proof: proof,
        publicSignals: publicSignals,
        metadata: {
            generatedAt: new Date().toISOString(),
            ...metadata
        }
    };
}

module.exports = {
    generateMandateProof,
    verifyMandateProof,
    exportProof,
    hashMerchant
};
