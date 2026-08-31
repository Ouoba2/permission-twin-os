const { generateMandateProof, verifyMandateProof, exportProof } = require('../src/zk-proof');

async function runTests() {
    console.log('🧪 Tests du module ZK-Proof');
    console.log('===========================\n');

    // Test 1: Action valide
    console.log('=== Test 1: Action valide ===');
    try {
        const mandate = {
            maxAmount: 1000,
            allowedMerchants: ['AWS']
        };
        
        const action = {
            amount: 500,
            merchant: 'AWS'
        };
        
        const { proof, publicSignals } = await generateMandateProof(mandate, action);
        const isValid = await verifyMandateProof(proof, publicSignals);
        
        if (isValid) {
            console.log('✅ TEST RÉUSSI: Action valide acceptée\n');
        } else {
            console.log('❌ TEST ÉCHOUÉ: Action valide rejetée\n');
        }
    } catch (error) {
        console.error('❌ ERREUR:', error.message, '\n');
    }

    // Test 2: Montant dépasse le max
    console.log('=== Test 2: Montant dépasse le max ===');
    try {
        const mandate = {
            maxAmount: 1000,
            allowedMerchants: ['AWS']
        };
        
        const action = {
            amount: 1500, // Dépasse le max
            merchant: 'AWS'
        };
        
        const { proof, publicSignals } = await generateMandateProof(mandate, action);
        const isValid = await verifyMandateProof(proof, publicSignals);
        
        if (!isValid) {
            console.log('✅ TEST RÉUSSI: Action invalide rejetée\n');
        } else {
            console.log('❌ TEST ÉCHOUÉ: Action invalide acceptée\n');
        }
    } catch (error) {
        console.error('❌ ERREUR:', error.message, '\n');
    }

    // Test 3: Marchand non autorisé
    console.log('=== Test 3: Marchand non autorisé ===');
    try {
        const mandate = {
            maxAmount: 1000,
            allowedMerchants: ['AWS']
        };
        
        const action = {
            amount: 500,
            merchant: 'Azure' // Non autorisé
        };
        
        const { proof, publicSignals } = await generateMandateProof(mandate, action);
        const isValid = await verifyMandateProof(proof, publicSignals);
        
        if (!isValid) {
            console.log('✅ TEST RÉUSSI: Marchand non autorisé rejeté\n');
        } else {
            console.log('❌ TEST ÉCHOUÉ: Marchand non autorisé accepté\n');
        }
    } catch (error) {
        console.error('❌ ERREUR:', error.message, '\n');
    }

    // Test 4: Export au format JSON
    console.log('=== Test 4: Export au format JSON ===');
    try {
        const mandate = {
            maxAmount: 1000,
            allowedMerchants: ['AWS']
        };
        
        const action = {
            amount: 500,
            merchant: 'AWS'
        };
        
        const { proof, publicSignals } = await generateMandateProof(mandate, action);
        const exported = exportProof(proof, publicSignals, {
            mandateId: 'test-001',
            agentId: 'agent-demo'
        });
        
        console.log('Preuve exportée:', JSON.stringify(exported, null, 2).substring(0, 200) + '...');
        console.log('✅ TEST RÉUSSI: Export JSON fonctionnel\n');
    } catch (error) {
        console.error('❌ ERREUR:', error.message, '\n');
    }

    console.log('🏁 Tests terminés');
}

runTests().catch(console.error);
